import { describe, test, expect } from "vitest";
import { computeOutgoingAction, resolveApproveOutcome } from "@/jazz/handshake";

const NOW = 1_800_000_000_000;

describe("computeOutgoingAction", () => {
  test("approval stamp on a pending entry → approve", () => {
    expect(
      computeOutgoingAction(
        { status: "pending", approvedAtMs: NOW - 1000 },
        NOW,
      ),
    ).toBe("approve");
  });

  test("denial stamp on a pending entry → deny", () => {
    expect(
      computeOutgoingAction({ status: "pending", deniedAtMs: NOW - 1000 }, NOW),
    ).toBe("deny");
  });

  test("approval wins over concurrent denial (matches recipient-side approve-wins)", () => {
    expect(
      computeOutgoingAction(
        { status: "pending", approvedAtMs: NOW - 1000, deniedAtMs: NOW - 500 },
        NOW,
      ),
    ).toBe("approve");
  });

  test("pending entry past request expiry → expire", () => {
    expect(
      computeOutgoingAction(
        { status: "pending", expiresAtMs: NOW - 1 },
        NOW,
      ),
    ).toBe("expire");
  });

  test("approval stamp beats expiry (approved late still counts)", () => {
    expect(
      computeOutgoingAction(
        { status: "pending", approvedAtMs: NOW - 1000, expiresAtMs: NOW - 1 },
        NOW,
      ),
    ).toBe("approve");
  });

  test("archived entries are inert", () => {
    expect(
      computeOutgoingAction(
        { status: "approved", archivedAtMs: NOW - 1000, approvedAtMs: NOW - 2000 },
        NOW,
      ),
    ).toBe("none");
  });

  test("failed entries are not reactive transitions (retry is launch/reconnect-driven)", () => {
    expect(computeOutgoingAction({ status: "failed" }, NOW)).toBe("none");
  });

  test("live pending entry with no stamps → none", () => {
    expect(
      computeOutgoingAction(
        { status: "pending", expiresAtMs: NOW + 1000 },
        NOW,
      ),
    ).toBe("none");
  });
});

// Pins the sanctioned deviation from the plan snippet (which archived
// unconditionally on approve). "unavailable" → "retry" prevents archiving an
// approval whose contact write didn't happen — exactly the FM3 silent loss this
// slice exists to kill. All other upsert results mean the contact is durably
// recorded (conflict keeps the old TOFU pin + sets the flag), so they archive.
describe("resolveApproveOutcome", () => {
  test("unavailable → retry (contact not yet written; must not archive)", () => {
    expect(resolveApproveOutcome("unavailable")).toBe("retry");
  });

  test("created / unchanged / conflict → archive (contact durably recorded)", () => {
    expect(resolveApproveOutcome("created")).toBe("archive");
    expect(resolveApproveOutcome("unchanged")).toBe("archive");
    expect(resolveApproveOutcome("conflict")).toBe("archive");
  });
});
