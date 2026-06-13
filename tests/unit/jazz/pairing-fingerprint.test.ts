import { describe, test, expect } from "vitest";
import { deriveResponderFingerprint } from "@/jazz/pairing";

describe("deriveResponderFingerprint", () => {
  test("returns 8 uppercase hex chars", async () => {
    const fp = await deriveResponderFingerprint("01020304");
    expect(fp).toMatch(/^[0-9A-F]{8}$/);
  });
  test("is deterministic for the same input", async () => {
    const a = await deriveResponderFingerprint("01020304");
    const b = await deriveResponderFingerprint("01020304");
    expect(a).toBe(b);
  });
  test("changes when the input changes", async () => {
    const a = await deriveResponderFingerprint("01020304");
    const c = await deriveResponderFingerprint("01020305");
    expect(a).not.toBe(c);
  });
});
