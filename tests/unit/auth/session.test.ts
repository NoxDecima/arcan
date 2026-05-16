import { describe, it, expect } from "vitest";
import { getCurrentSessionFingerprint } from "@/auth/session";
import { createJazzTestAccount } from "jazz-tools/testing";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

describe("getCurrentSessionFingerprint", () => {
  it("returns a non-empty string", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Test User" },
      isCurrentActiveAccount: true,
    });

    const fingerprint = getCurrentSessionFingerprint(me);
    expect(typeof fingerprint).toBe("string");
    expect(fingerprint.length).toBeGreaterThan(0);
  });

  it("is stable across multiple calls for the same account", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Test User" },
      isCurrentActiveAccount: true,
    });

    const fp1 = getCurrentSessionFingerprint(me);
    const fp2 = getCurrentSessionFingerprint(me);
    expect(fp1).toBe(fp2);
  });
});
