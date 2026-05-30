import { describe, test, expect } from "vitest";
import { recoveryProof } from "@/auth/recovery-proof";

describe("recoveryProof", () => {
  test("is deterministic for the same seed", async () => {
    const seed = new Uint8Array(32).fill(0x42);
    const p1 = await recoveryProof(seed);
    const p2 = await recoveryProof(seed);
    expect(p1).toEqual(p2);
  });

  test("differs for different seeds", async () => {
    const a = new Uint8Array(32).fill(0x42);
    const b = new Uint8Array(32).fill(0x43);
    expect(await recoveryProof(a)).not.toEqual(await recoveryProof(b));
  });

  test("output is base64 of 32 bytes (44 chars with padding)", async () => {
    const seed = new Uint8Array(32).fill(0x42);
    const out = await recoveryProof(seed);
    expect(out).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });
});
