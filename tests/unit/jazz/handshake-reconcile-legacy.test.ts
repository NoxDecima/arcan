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
 * key in the contacts record gets upserted with its original TOFU pin.
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
  test("loaded legacy entry missing from the record → upserted with the legacy pin verbatim + displayNameLocal preserved", () => {
    const { me, setSpy } = makeMe({}, [legacyAda]);
    reconcileLegacyContacts(me);
    expect(setSpy).toHaveBeenCalledTimes(1);
    const [key, value] = setSpy.mock.calls[0];
    expect(key).toBe("acc-ada");
    expect(value).toMatchObject({
      contactAccountID: "acc-ada",
      pinnedFingerprint: "fp-ada-legacy",
      displayNameLocal: "Ada",
    });
  });

  test("entry already in the record → untouched (no record write, no conflict re-flag even when the legacy pin differs)", () => {
    const entrySet = vi.fn();
    const { me, setSpy } = makeMe(
      {
        "acc-ada": {
          contactAccountID: "acc-ada",
          pinnedFingerprint: "fp-ada-record",
          displayNameLocal: "Ada",
          $jazz: { set: entrySet },
        },
      },
      // Stale legacy dup with a DIFFERENT fingerprint: the record is
      // authoritative; the reconcile must not re-flag a conflict every launch.
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

  test("mixed list: valid entries upserted, unloaded neighbors skipped", () => {
    const { me, setSpy } = makeMe({}, [null, legacyAda]);
    reconcileLegacyContacts(me);
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0][0]).toBe("acc-ada");
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
