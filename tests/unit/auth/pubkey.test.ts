import { describe, it, expect, vi } from "vitest";
import { base58 } from "@scure/base";
import {
  getAccountPubkeyHex,
  getForeignAccountPubkeyHex,
  normalizeToHex64,
} from "@/auth/pubkey";
import { createJazzTestAccount } from "jazz-tools/testing";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";

describe("getAccountPubkeyHex", () => {
  it("returns a 64-character lowercase hex string", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Test User" },
      isCurrentActiveAccount: true,
    });

    const hex = getAccountPubkeyHex(me);
    expect(hex).toHaveLength(64);
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic for the same account", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Test User" },
      isCurrentActiveAccount: true,
    });

    const hex1 = getAccountPubkeyHex(me);
    const hex2 = getAccountPubkeyHex(me);
    expect(hex1).toBe(hex2);
  });

  it("differs for different accounts", async () => {
    const me1 = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const hex1 = getAccountPubkeyHex(me1);

    const me2 = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: true,
    });
    const hex2 = getAccountPubkeyHex(me2);

    expect(hex1).not.toBe(hex2);
  });
});

describe("getForeignAccountPubkeyHex", () => {
  // Mock shapes mirror the real API surface (verified against installed
  // typings):
  //  - account.$jazz.raw.currentAgentID(): AgentID
  //    (cojson/dist/coValues/account.d.ts:17; AgentID template
  //    `sealer_z${string}/signer_z${string}` per cojson/dist/ids.d.ts:15)
  //  - account.$jazz.localNode.crypto.getAgentSignerID(agentID): SignerID
  //    (cojson/dist/localNode.d.ts:28 + cojson/dist/crypto/crypto.d.ts:33 —
  //    extracts the `signer_z…` half of the agent ID)
  //  - account.$jazz.localNode.getCurrentAgent().currentSignerID() is the
  //    AMBIENT session's signer — the C1 trap this helper must NOT touch.
  const TARGET_PUBKEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const NODE_PUBKEY = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
  const targetSignerID = `signer_z${base58.encode(TARGET_PUBKEY)}`;
  const nodeSignerID = `signer_z${base58.encode(NODE_PUBKEY)}`;
  const targetAgentID = `sealer_z${base58.encode(TARGET_PUBKEY)}/${targetSignerID}`;

  function makeForeignAccountMock() {
    const getCurrentAgent = vi.fn(() => ({
      currentSignerID: () => nodeSignerID,
    }));
    const account = {
      $jazz: {
        raw: { currentAgentID: vi.fn(() => targetAgentID) },
        localNode: {
          crypto: {
            getAgentSignerID: vi.fn((agentID: string) => agentID.split("/")[1]),
          },
          getCurrentAgent,
        },
      },
    };
    return { account, getCurrentAgent };
  }

  it("derives the hex from the TARGET account's own agent ID, not the ambient node", () => {
    const { account, getCurrentAgent } = makeForeignAccountMock();
    const hex = getForeignAccountPubkeyHex(account as any);
    expect(hex).toBe(normalizeToHex64(TARGET_PUBKEY));
    expect(hex).not.toBe(normalizeToHex64(NODE_PUBKEY));
    // The node-session agent (the C1 bug source) must never be consulted.
    expect(getCurrentAgent).not.toHaveBeenCalled();
  });

  it("regression contrast: getAccountPubkeyHex on the same foreign account returns the AMBIENT node's key (the C1 bug)", () => {
    const { account } = makeForeignAccountMock();
    // Documents WHY getAccountPubkeyHex must never be used for foreign
    // accounts: it reads the caller's session agent, not the target's.
    expect(getAccountPubkeyHex(account as any)).toBe(
      normalizeToHex64(NODE_PUBKEY),
    );
    expect(getForeignAccountPubkeyHex(account as any)).not.toBe(
      getAccountPubkeyHex(account as any),
    );
  });

  it("agrees with the node-derived pubkey for one's OWN account (real Jazz account)", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Test User" },
      isCurrentActiveAccount: true,
    });
    // For the owning session both derivations must coincide — validates the
    // $jazz.raw.currentAgentID / crypto.getAgentSignerID surface at runtime.
    const hex = getForeignAccountPubkeyHex(me);
    expect(hex).toBe(getAccountPubkeyHex(me));
    expect(hex).toHaveLength(64);
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });
});
