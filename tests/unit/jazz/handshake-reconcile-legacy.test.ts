import { describe, test, expect, vi } from "vitest";

// Same schema stubs as handshake-upsert-contact.test.ts — handshake.ts
// statically imports both modules; neither is exercised here.
vi.mock("@/jazz/schema/Contact", () => ({
  Contact: { create: (init: Record<string, unknown>) => ({ ...init }) },
  ContactBook: {},
}));
vi.mock("@/jazz/schema/ArcanAccount", () => ({ ArcanAccount: {} }));

import { reconcileLegacyContacts } from "@/jazz/handshake";

/**
 * Startup reconcile pass (stuck-account fix, 2026-07-21). The contacts
 * backfill (ArcanAccount block 2i) now tolerates unloadable legacy entries
 * ($onError: "catch") — this pass is the safety net that makes that tolerance
 * safe: any legacy contactBook entry that LOADS on a later launch but has no
 * key in the contacts record gets set directly into the record with its
 * original TOFU pin (and all metadata) intact.
 */

/**
 * Fake `me` with a STATEFUL contacts record (set() lands the entry so has()
 * sees it — lets the idempotency test observe that a second pass is a no-op)
 * plus a legacy contactBook array.
 */
function makeMe(
  existing: Record<string, any>,
  contactBook: any[] | undefined,
) {
  const entries: Record<string, any> = { ...existing };
  const setSpy = vi.fn((key: string, value: any) => {
    entries[key] = value;
  });
  const contacts: any = entries;
  contacts.$jazz = { set: setSpy, has: (k: string) => k in entries };
  const me: any = { $jazz: { id: "me-acc" }, root: { contacts } };
  if (contactBook !== undefined) me.root.contactBook = contactBook;
  return { me, setSpy, contacts };
}

const legacyAda = {
  contactAccountID: "acc-ada",
  pinnedFingerprint: "fp-ada-legacy",
  displayNameLocal: "Ada",
  addedAt: new Date("2025-01-01T00:00:00Z"),
};

describe("reconcileLegacyContacts", () => {
  test("loaded legacy entry missing from the record → set directly with legacy CoValue (preserves pin/addedAt/displayNameLocal)", () => {
    const { me, setSpy } = makeMe({}, [legacyAda]);
    reconcileLegacyContacts(me);
    expect(setSpy).toHaveBeenCalledTimes(1);
    const [key, value] = setSpy.mock.calls[0];
    expect(key).toBe("acc-ada");
    // The legacy entry itself must be set — not a new Contact — so object
    // identity matches (same reference, all fields intact).
    expect(value).toBe(legacyAda);
  });

  test("entry present with differing pin, not yet flagged → flagged once (fingerprintConflict set, pinnedFingerprint untouched)", () => {
    const entrySet = vi.fn();
    const existingEntry = {
      contactAccountID: "acc-ada",
      pinnedFingerprint: "fp-ada-record",
      displayNameLocal: "Ada",
      fingerprintConflict: false,
      $jazz: { set: entrySet },
    };
    const { me, setSpy } = makeMe(
      { "acc-ada": existingEntry },
      // Stale legacy dup with a DIFFERENT fingerprint.
      [{ ...legacyAda, pinnedFingerprint: "fp-ada-older" }],
    );
    reconcileLegacyContacts(me);
    // No record-level set (key already present).
    expect(setSpy).not.toHaveBeenCalled();
    // Entry-level: conflict flagged once.
    expect(entrySet).toHaveBeenCalledWith("fingerprintConflict", true);
    expect(entrySet).toHaveBeenCalledWith("conflictingFingerprint", "fp-ada-older");
    // pinnedFingerprint itself must NOT be touched.
    expect(entrySet).not.toHaveBeenCalledWith("pinnedFingerprint", expect.anything());
  });

  test("entry present, already flagged with differing pin → no further writes on second pass", () => {
    const entrySet = vi.fn();
    const existingEntry = {
      contactAccountID: "acc-ada",
      pinnedFingerprint: "fp-ada-record",
      displayNameLocal: "Ada",
      fingerprintConflict: true, // already flagged from a previous launch
      conflictingFingerprint: "fp-ada-older",
      $jazz: { set: entrySet },
    };
    const { me, setSpy } = makeMe(
      { "acc-ada": existingEntry },
      [{ ...legacyAda, pinnedFingerprint: "fp-ada-older" }],
    );
    reconcileLegacyContacts(me);
    expect(setSpy).not.toHaveBeenCalled();
    expect(entrySet).not.toHaveBeenCalled();
  });

  test("unloaded/null legacy entries → skipped (they heal on a later launch once they load)", () => {
    const { me, setSpy } = makeMe({}, [
      null, // caught by $onError: "catch" in the watcher resolve
      undefined,
      // header-only stub: schema fields all read undefined
      { $jazz: { id: "co_zStub", loadingState: "unavailable" } },
      // partially-readable entry with no pin — nothing trustworthy to copy
      { contactAccountID: "acc-nopin", displayNameLocal: "NoPin" },
    ]);
    reconcileLegacyContacts(me);
    expect(setSpy).not.toHaveBeenCalled();
  });

  test("mixed list: valid entries set, unloaded neighbors skipped", () => {
    const { me, setSpy } = makeMe({}, [null, legacyAda]);
    reconcileLegacyContacts(me);
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0][0]).toBe("acc-ada");
    expect(setSpy.mock.calls[0][1]).toBe(legacyAda);
  });

  test("contacts record absent (migration still pending) → no-op", () => {
    const me: any = {
      $jazz: { id: "me-acc" },
      root: { contactBook: [legacyAda] },
    };
    expect(() => reconcileLegacyContacts(me)).not.toThrow();
  });

  test("legacy contactBook absent/empty → no-op", () => {
    const absent = makeMe({}, undefined);
    reconcileLegacyContacts(absent.me);
    expect(absent.setSpy).not.toHaveBeenCalled();

    const empty = makeMe({}, []);
    reconcileLegacyContacts(empty.me);
    expect(empty.setSpy).not.toHaveBeenCalled();
  });

  test("idempotent: a second pass after the heal writes nothing new", () => {
    const { me, setSpy } = makeMe({}, [legacyAda]);
    reconcileLegacyContacts(me);
    expect(setSpy).toHaveBeenCalledTimes(1);
    reconcileLegacyContacts(me);
    expect(setSpy).toHaveBeenCalledTimes(1); // stateful fake: has() now true
  });
});
