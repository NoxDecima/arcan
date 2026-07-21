import { describe, test, expect } from "vitest";
import {
  shouldPruneIncomingRequest,
  shouldPrunePendingNotification,
  isPrunableForeignIncomingEntry,
  SETTLED_REQUEST_RETENTION_MS,
} from "@/jazz/handshake";

const NOW = 1_800_000_000_000;
const OLD = NOW - SETTLED_REQUEST_RETENTION_MS - 1000;
const RECENT = NOW - 1000;

describe("shouldPruneIncomingRequest", () => {
  test("recently approved → kept", () => {
    expect(shouldPruneIncomingRequest({ approvedAtMs: RECENT }, NOW)).toBe(false);
  });
  test("approved >30 days ago → pruned", () => {
    expect(shouldPruneIncomingRequest({ approvedAtMs: OLD }, NOW)).toBe(true);
  });
  test("denied >30 days ago → pruned", () => {
    expect(shouldPruneIncomingRequest({ deniedAtMs: OLD }, NOW)).toBe(true);
  });
  test("expired >30 days ago (never acted on) → pruned", () => {
    expect(shouldPruneIncomingRequest({ expiresAtMs: OLD }, NOW)).toBe(true);
  });
  test("recently expired → kept (grace window)", () => {
    expect(shouldPruneIncomingRequest({ expiresAtMs: RECENT }, NOW)).toBe(false);
  });
  test("live pending request → kept", () => {
    expect(
      shouldPruneIncomingRequest({ expiresAtMs: NOW + 1000 }, NOW),
    ).toBe(false);
  });
});

/**
 * Foreign-payload cleanup (followup #52). Input shapes mirror the jazz-tools
 * 0.20.18 runtime: a LOADED entry is a CoMap proxy with `$isLoaded: true`
 * (non-enumerable, defined at construction); a set-but-unloaded entry read
 * off the record proxy is a truthy stub `{ $jazz, $isLoaded: false }`
 * (createUnloadedCoValue) whose schema fields all read undefined — so a
 * header-only REAL request looks shapeless and must NEVER be pruned on shape.
 */
describe("isPrunableForeignIncomingEntry", () => {
  test("loaded foreign payload (no requesterAccountID) → prune", () => {
    expect(
      isPrunableForeignIncomingEntry({
        $isLoaded: true,
        $jazz: { id: "co_zForeign" },
        // pre-dispatcher phantom: ConversationNotification persisted through
        // the ConnectionRequest schema — conversationID set, no requester.
        conversationID: "co_zConv",
      }),
    ).toBe(true);
  });
  test("loaded real request (string requesterAccountID) → keep", () => {
    expect(
      isPrunableForeignIncomingEntry({
        $isLoaded: true,
        $jazz: { id: "co_zReq" },
        requesterAccountID: "co_zRequester",
      }),
    ).toBe(false);
  });
  test("loaded entry with non-string requesterAccountID → prune (not a real request)", () => {
    expect(
      isPrunableForeignIncomingEntry({
        $isLoaded: true,
        $jazz: { id: "co_zWeird" },
        requesterAccountID: 42,
      }),
    ).toBe(true);
  });
  test("unloaded stub ($isLoaded: false) → keep (could be a real request still syncing)", () => {
    expect(
      isPrunableForeignIncomingEntry({
        $isLoaded: false,
        $jazz: { id: "co_zPending", loadingState: "unavailable" },
      }),
    ).toBe(false);
  });
  test("null entry → keep (never prune)", () => {
    expect(isPrunableForeignIncomingEntry(null)).toBe(false);
  });
  test("undefined entry → keep (never prune)", () => {
    expect(isPrunableForeignIncomingEntry(undefined)).toBe(false);
  });
  test("object without $isLoaded → keep (load state unknown, never prune)", () => {
    expect(
      isPrunableForeignIncomingEntry({ $jazz: { id: "co_zUnknown" } }),
    ).toBe(false);
  });
});

describe("shouldPrunePendingNotification", () => {
  test("notification created >30 days ago → pruned (permanently-undeliverable bookkeeping)", () => {
    expect(shouldPrunePendingNotification({ createdAtMs: OLD }, NOW)).toBe(true);
  });
  test("notification created recently → kept", () => {
    expect(shouldPrunePendingNotification({ createdAtMs: RECENT }, NOW)).toBe(false);
  });
  test("notification created exactly at retention boundary → kept (boundary is exclusive)", () => {
    expect(
      shouldPrunePendingNotification(
        { createdAtMs: NOW - SETTLED_REQUEST_RETENTION_MS },
        NOW,
      ),
    ).toBe(false);
  });
  test("notification created just past boundary → pruned", () => {
    expect(
      shouldPrunePendingNotification(
        { createdAtMs: NOW - SETTLED_REQUEST_RETENTION_MS - 1 },
        NOW,
      ),
    ).toBe(true);
  });
});
