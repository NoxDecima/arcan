import { describe, test, expect, vi } from "vitest";
import { getUnreadCount } from "@/jazz/notifications";

// Lightweight mocks — getUnreadCount is a pure function that
// only reads .messages, .sentAt, .$jazz.id from the conversation; we don't
// need the full Jazz machinery.

function mkMsg(sentAt: Date, authorID: string) {
  return {
    sentAt,
    $jazz: { id: `msg-${sentAt.getTime()}-${authorID}` },
    // getAuthorAccountIDFromMessage reads the create-tx signer; for the
    // unit test we stub it via a top-level mock below
    _testAuthor: authorID,
  };
}

vi.mock("@/jazz/messages", () => ({
  getAuthorAccountIDFromMessage: (m: any) => m?._testAuthor,
}));

describe("getUnreadCount", () => {
  const myID = "co_zMe";

  test("returns 0 for empty messages", () => {
    expect(getUnreadCount({ messages: [] } as any, 0, myID)).toBe(0);
  });

  test("returns 0 for null/undefined conversation", () => {
    expect(getUnreadCount(null as any, 0, myID)).toBe(0);
    expect(getUnreadCount(undefined as any, 0, myID)).toBe(0);
  });

  test("missing lastReadAt entry → all foreign messages count", () => {
    const conv = {
      messages: [
        mkMsg(new Date(1000), "co_zBob"),
        mkMsg(new Date(2000), "co_zBob"),
        mkMsg(new Date(3000), myID), // mine — excluded
      ],
    } as any;
    expect(getUnreadCount(conv, undefined, myID)).toBe(2);
  });

  test("excludes my own messages", () => {
    const conv = {
      messages: [
        mkMsg(new Date(1000), myID),
        mkMsg(new Date(2000), myID),
      ],
    } as any;
    expect(getUnreadCount(conv, 0, myID)).toBe(0);
  });

  test("cutoff = newest message → 0", () => {
    const conv = {
      messages: [
        mkMsg(new Date(1000), "co_zBob"),
        mkMsg(new Date(2000), "co_zBob"),
      ],
    } as any;
    expect(getUnreadCount(conv, 2000, myID)).toBe(0);
  });

  test("cutoff between messages → only newer ones count", () => {
    const conv = {
      messages: [
        mkMsg(new Date(1000), "co_zBob"),
        mkMsg(new Date(2000), "co_zBob"),
        mkMsg(new Date(3000), "co_zBob"),
      ],
    } as any;
    expect(getUnreadCount(conv, 1500, myID)).toBe(2);
  });

  test("string sentAt coerces correctly", () => {
    const conv = {
      messages: [
        { sentAt: "2026-05-01T00:00:00Z", _testAuthor: "co_zBob" },
      ],
    } as any;
    expect(getUnreadCount(conv, 0, myID)).toBe(1);
  });

  test("in-flight message (undefined sentAt + undefined author) is NOT counted", () => {
    // Regression: when a message arrives via Jazz sync, it can briefly
    // appear in conversation.messages BEFORE its first transaction is
    // validated. During that window both `m.sentAt` and `m.$jazz.createdBy`
    // are undefined. Without defensive guards:
    //   - new Date(undefined).getTime() yields NaN
    //   - NaN <= cutoff is false → message slips past the cutoff filter
    //   - undefined !== myID is true → message slips past the self check
    //   - → counted as 1 unread → spurious notification on the same
    //     account's other tabs when the user sends a message.
    // Both guards (Number.isFinite + authorID == null skip) prevent this.
    const conv = {
      messages: [
        { sentAt: undefined, _testAuthor: undefined },
      ],
    } as any;
    expect(getUnreadCount(conv, 1000, myID)).toBe(0);
  });

  test("message with valid sentAt but unresolved author is NOT counted", () => {
    // Subset of the above: a partially-validated message where sentAt is
    // present but author hasn't been resolved yet. Until we know the
    // author, treat as "skip" rather than spuriously counting.
    const conv = {
      messages: [
        { sentAt: new Date(2000), _testAuthor: undefined },
      ],
    } as any;
    expect(getUnreadCount(conv, 1000, myID)).toBe(0);
  });
});
