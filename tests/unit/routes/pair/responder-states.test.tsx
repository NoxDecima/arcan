import { describe, test, expect } from "vitest";
import { nextPairingPhase } from "@/jazz/pairing";

describe("responder phase transitions", () => {
  test("wrappedAccountSecret -> claiming wins over rejectedAt", () => {
    expect(nextPairingPhase({ wrappedAccountSecret: "x", rejectedAt: new Date() })).toBe("claiming");
  });
  test("rejectedAt alone -> rejected", () => {
    expect(nextPairingPhase({ rejectedAt: new Date() })).toBe("rejected");
  });
  test("past expiresAt with no other signal -> timed-out", () => {
    expect(nextPairingPhase({ expiresAt: new Date(Date.now() - 1000) })).toBe("timed-out");
  });
  test("future expiresAt with no other signal -> waiting-approval", () => {
    expect(nextPairingPhase({ expiresAt: new Date(Date.now() + 60_000) })).toBe("waiting-approval");
  });
});
