import { describe, it, expect } from "vitest";
import { getAccountPubkeyHex } from "@/auth/pubkey";
import { createJazzTestAccount } from "jazz-tools/testing";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

describe("getAccountPubkeyHex", () => {
  it("returns a 64-character lowercase hex string", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Test User" },
      isCurrentActiveAccount: true,
    });

    const hex = getAccountPubkeyHex(me);
    expect(hex).toHaveLength(64);
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic for the same account", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Test User" },
      isCurrentActiveAccount: true,
    });

    const hex1 = getAccountPubkeyHex(me);
    const hex2 = getAccountPubkeyHex(me);
    expect(hex1).toBe(hex2);
  });

  it("differs for different accounts", async () => {
    const me1 = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const hex1 = getAccountPubkeyHex(me1);

    const me2 = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: true,
    });
    const hex2 = getAccountPubkeyHex(me2);

    expect(hex1).not.toBe(hex2);
  });
});
