import { describe, test, expect } from "vitest";
import {
  shouldPruneIncomingRequest,
  shouldPrunePendingNotification,
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
