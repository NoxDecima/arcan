import { describe, test, expect, vi } from "vitest";

// Same schema stubs as handshake-upsert-contact.test.ts — handshake.ts
// statically imports both modules; neither is exercised here.
vi.mock("@/jazz/schema/Contact", () => ({
  Contact: { create: (init: Record<string, unknown>) => ({ ...init }) },
  ContactBook: {},
}));
vi.mock("@/jazz/schema/ArcanAccount", () => ({ ArcanAccount: {} }));

import { getContact, getLegacyContact } from "@/jazz/handshake";

/**
 * Migration-review carry-over (Task 13): the concurrent-two-device migration
 * race can strand a contact that exists ONLY in the legacy contactBook — the
 * LWW-losing device's `contacts` snapshot won the record ref but missed the
 * entry. Detection stays record-authoritative (getContact → undefined ⇒
 * repairable), while the repair path copies the stranded entry's legitimate
 * TOFU pin via getLegacyContact instead of re-deriving from the live account.
 */

const stranded = {
  contactAccountID: "acc-stranded",
  pinnedFingerprint: "b".repeat(64),
  displayNameLocal: "Strandy",
};

describe("getLegacyContact (stranded-entry repair lookup)", () => {
  test("record present but entry missing: getContact says missing, getLegacyContact finds the stranded pin", () => {
    const me = {
      $jazz: { id: "me-acc" },
      root: {
        // Record EXISTS (migration completed — LWW loser's snapshot) but the
        // stranded contact is absent from it.
        contacts: { $jazz: { set: vi.fn(), has: () => false } },
        contactBook: [stranded],
      },
    };
    // Record is authoritative → counterpart counts as "missing" (repairable)
    // even though a legacy list entry exists.
    expect(getContact(me, "acc-stranded")).toBeUndefined();
    // …and the repair can copy the legacy entry's legitimate pin.
    expect(getLegacyContact(me, "acc-stranded")).toMatchObject(stranded);
  });

  test("record absent (migration pending): legacy entry is reachable via both lookups", () => {
    const me = {
      $jazz: { id: "me-acc" },
      root: { contactBook: [stranded] },
    };
    // getContact's migration-pending fallback reports the contact → the
    // repair affordance does NOT show for this account state.
    expect(getContact(me, "acc-stranded")).toMatchObject(stranded);
    expect(getLegacyContact(me, "acc-stranded")).toMatchObject(stranded);
  });

  test("no legacy entry → undefined (repair falls back to live-key TOFU re-pin)", () => {
    const me = {
      $jazz: { id: "me-acc" },
      root: {
        contacts: { $jazz: { set: vi.fn(), has: () => false } },
        contactBook: [],
      },
    };
    expect(getLegacyContact(me, "acc-stranded")).toBeUndefined();
  });
});
