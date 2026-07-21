import { describe, test, expect, vi } from "vitest";

// Stub CoValue creation: Contact.create with a mock owner would throw inside
// jazz-tools. The stub returns the init object so field assertions hold.
// (Same technique as the existing jazz unit tests' schema stubs.)
vi.mock("@/jazz/schema/Contact", () => ({
  Contact: {
    create: (init: Record<string, unknown>) => ({ ...init }),
  },
  ContactBook: {},
}));

import { upsertContact } from "@/jazz/handshake";

function makeMe(existing: Record<string, any> = {}) {
  const setSpy = vi.fn();
  const contacts: any = { ...existing };
  contacts.$jazz = { set: setSpy };
  const me = { $jazz: { id: "me-acc" }, root: { contacts } };
  return { me, setSpy, contacts };
}

const data = {
  contactAccountID: "acc-x",
  fingerprint: "fp-x",
  displayName: "Xenia",
};

describe("upsertContact", () => {
  test("creates a new contact keyed by account ID when absent", () => {
    const { me, setSpy } = makeMe();
    const result = upsertContact(me as any, data);
    expect(result).toBe("created");
    expect(setSpy).toHaveBeenCalledTimes(1);
    const [key, value] = setSpy.mock.calls[0];
    expect(key).toBe("acc-x");
    expect(value).toMatchObject({
      contactAccountID: "acc-x",
      pinnedFingerprint: "fp-x",
      displayNameLocal: "Xenia",
    });
    expect(value.addedAt).toBeInstanceOf(Date);
  });

  test("no-ops when the contact exists with a matching fingerprint", () => {
    const entrySet = vi.fn();
    const { me, setSpy } = makeMe({
      "acc-x": {
        contactAccountID: "acc-x",
        pinnedFingerprint: "fp-x",
        displayNameLocal: "Old Name",
        $jazz: { set: entrySet },
      },
    });
    const result = upsertContact(me as any, data);
    expect(result).toBe("unchanged");
    expect(setSpy).not.toHaveBeenCalled();
    expect(entrySet).not.toHaveBeenCalled(); // display name stays frozen
  });

  test("TOFU: fingerprint mismatch keeps the OLD pin and flags the conflict", () => {
    const entrySet = vi.fn();
    const { me, setSpy } = makeMe({
      "acc-x": {
        contactAccountID: "acc-x",
        pinnedFingerprint: "fp-old",
        displayNameLocal: "Xenia",
        $jazz: { set: entrySet },
      },
    });
    const result = upsertContact(me as any, data);
    expect(result).toBe("conflict");
    expect(setSpy).not.toHaveBeenCalled(); // entry NOT replaced
    expect(entrySet).toHaveBeenCalledWith("fingerprintConflict", true);
    expect(entrySet).toHaveBeenCalledWith("conflictingFingerprint", "fp-x");
    const pinWrites = entrySet.mock.calls.filter(
      ([k]: [string]) => k === "pinnedFingerprint",
    );
    expect(pinWrites).toHaveLength(0); // pin NEVER overwritten
  });

  test("returns 'unavailable' when the contacts record is not loaded", () => {
    const me = { $jazz: { id: "me-acc" }, root: {} };
    expect(upsertContact(me as any, data)).toBe("unavailable");
  });
});
