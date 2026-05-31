import { describe, test, expect, vi } from "vitest";
import { getUnreadCount, markRead } from "@/jazz/notifications";

// Lightweight mocks — getUnreadCount + markRead are pure functions that
// only read .messages, .sentAt, .$jazz.id from the conversation; we don't
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
});

describe("markRead", () => {
  test("writes max(now, latestSeen + 1) via $jazz.set", () => {
    const setSpy = vi.fn();
    const oldNow = Date.now;
    Date.now = () => 5000;

    const me = {
      root: {
        lastReadAt: { $jazz: { set: setSpy } },
        knownConversations: [
          {
            $jazz: { id: "conv-X" },
            messages: [
              { sentAt: new Date(1000) },
              { sentAt: new Date(2000) },
            ],
          },
        ],
      },
    } as any;

    markRead(me, "conv-X");
    expect(setSpy).toHaveBeenCalledWith("conv-X", 5000); // now > latestSeen + 1

    Date.now = oldNow;
  });

  test("advances past newest message even if clock is behind", () => {
    const setSpy = vi.fn();
    const oldNow = Date.now;
    Date.now = () => 100; // clock way behind

    const me = {
      root: {
        lastReadAt: { $jazz: { set: setSpy } },
        knownConversations: [
          {
            $jazz: { id: "conv-X" },
            messages: [{ sentAt: new Date(9999) }],
          },
        ],
      },
    } as any;

    markRead(me, "conv-X");
    expect(setSpy).toHaveBeenCalledWith("conv-X", 10000); // 9999 + 1

    Date.now = oldNow;
  });

  test("no-op when me.root.lastReadAt missing", () => {
    expect(() => markRead({ root: {} } as any, "conv-X")).not.toThrow();
    expect(() => markRead({} as any, "conv-X")).not.toThrow();
    expect(() => markRead(null as any, "conv-X")).not.toThrow();
  });

  test("conversation not in knownConversations → writes Date.now()", () => {
    const setSpy = vi.fn();
    const oldNow = Date.now;
    Date.now = () => 5000;

    const me = {
      root: {
        lastReadAt: { $jazz: { set: setSpy } },
        knownConversations: [],
      },
    } as any;

    markRead(me, "conv-X");
    expect(setSpy).toHaveBeenCalledWith("conv-X", 5000);

    Date.now = oldNow;
  });
});
