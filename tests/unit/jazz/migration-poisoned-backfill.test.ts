import { describe, it, expect } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Contact } from "@/jazz/schema/Contact";
import { ConnectionRequest } from "@/jazz/schema/ConnectionRequest";
import { listContacts, reconcileLegacyContacts } from "@/jazz/handshake";

/**
 * Integration tests (real Jazz runtime) for the list→record migration
 * backfills (ArcanAccount blocks 2i/2j) against POISONED legacy CoLists.
 *
 * Root cause pinned here (live-account bug, 2026-07-22): a falsy (null) raw
 * entry in a legacy CoList makes a deep
 * `ensureLoaded({ ...: { $each: { $onError: "catch" } } })` REJECT — in
 * jazz-tools 0.20.18, SubscriptionScope.loadCoListKey
 * (node_modules/jazz-tools/src/tools/subscribe/SubscriptionScope.ts:1117-1129)
 * files an index-keyed "ref on position N is required but missing" validation
 * error that `$onError: "catch"` CANNOT suppress: unlike loadCoMapKey (which
 * pre-adds caught keys to skipInvalidKeys, :1047-1055), loadCoListKey never
 * adds index keys to skipInvalidKeys, so computeChildErrors always surfaces
 * the error and the whole resolve fails. The backfill's catch then skips
 * WITHOUT setting the record field — on EVERY startup — and the account is
 * stuck migration-pending forever.
 *
 * The fix under test: shallow-load the list, scan `$jazz.raw.asArray()` for
 * ref-shaped string IDs, and load each entry individually (settles, never
 * throws) — keeping only `$isLoaded === true` entries.
 */

/**
 * A fresh test account gets the new record fields at root init (block 2), so
 * the 2i/2j backfills would be skipped. Delete them (both optional) to put
 * the account in the pre-slice legacy shape the backfills exist for.
 */
async function makeLegacyAccount(name = "Legacy"): Promise<any> {
  const me: any = await createJazzTestAccount({
    AccountSchema: ArcanAccount,
    creationProps: { name },
    isCurrentActiveAccount: true,
  });
  me.root.$jazz.delete("contacts");
  me.root.$jazz.delete("incomingConnectionRequests");
  return me;
}

function pushLegacyContact(
  me: any,
  contactAccountID: string,
  pinnedFingerprint: string,
  displayNameLocal: string,
  addedAt: Date,
): void {
  me.root.contactBook.$jazz.push(
    Contact.create(
      { contactAccountID, pinnedFingerprint, displayNameLocal, addedAt },
      { owner: me },
    ),
  );
}

/** Record keys without the proxy's $-prefixed members. */
function recordKeys(record: any): string[] {
  return Object.keys(record ?? {}).filter((k) => !k.startsWith("$"));
}

describe("migration backfill vs poisoned legacy lists (blocks 2i/2j)", () => {
  it("(a) 2i: contactBook with 2 good Contacts + a raw NULL entry -> contacts record created with the 2 good keys", async () => {
    const me = await makeLegacyAccount();
    pushLegacyContact(me, "acc-good-1", "fp-1", "Good One", new Date("2026-01-01T00:00:00Z"));
    pushLegacyContact(me, "acc-good-2", "fp-2", "Good Two", new Date("2026-01-02T00:00:00Z"));
    // The live-account poison: a falsy raw entry, invisible to the schema
    // API, unsurvivable for a deep $each resolve (see file docblock).
    (me.root.contactBook.$jazz.raw as any).append(null);

    await me.applyMigration();

    const loaded = await me.$jazz.ensureLoaded({
      resolve: { root: { contacts: { $each: { $onError: "catch" } } } },
    });
    const contacts = (loaded.root as any).contacts;
    expect(contacts).toBeTruthy();
    expect(recordKeys(contacts).sort()).toEqual(["acc-good-1", "acc-good-2"]);
    expect(contacts["acc-good-1"]?.pinnedFingerprint).toBe("fp-1");
    expect(contacts["acc-good-2"]?.displayNameLocal).toBe("Good Two");
  });

  it("(b) 2i: never-synced CoValue entry -> skipped, good entries migrate (regression pin)", async () => {
    const me = await makeLegacyAccount();
    // A Contact created on a DIFFERENT, never-linked node (no test sync
    // server is set up): the raw id is a well-formed ref that can never
    // load on `me`'s node.
    const stranger: any = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Stranger" },
    });
    const foreign = Contact.create(
      {
        contactAccountID: "acc-foreign",
        pinnedFingerprint: "fp-foreign",
        displayNameLocal: "Foreign",
        addedAt: new Date("2026-01-03T00:00:00Z"),
      },
      { owner: stranger },
    );
    pushLegacyContact(me, "acc-good-1", "fp-1", "Good One", new Date("2026-01-01T00:00:00Z"));
    pushLegacyContact(me, "acc-good-2", "fp-2", "Good Two", new Date("2026-01-02T00:00:00Z"));
    (me.root.contactBook.$jazz.raw as any).append(foreign.$jazz.id);

    await me.applyMigration();

    const loaded = await me.$jazz.ensureLoaded({
      resolve: { root: { contacts: { $each: { $onError: "catch" } } } },
    });
    const contacts = (loaded.root as any).contacts;
    expect(contacts).toBeTruthy();
    expect(recordKeys(contacts).sort()).toEqual(["acc-good-1", "acc-good-2"]);
  });

  it("(c) 2j: incomingRequests with a raw NULL entry -> incomingConnectionRequests record still created", async () => {
    const me = await makeLegacyAccount();
    const req = ConnectionRequest.create(
      {
        requesterAccountID: "acc-requester",
        requesterFingerprint: "fp-requester",
        requesterDisplayName: "Requester",
        recipientAccountID: me.$jazz.id,
        channel: "link",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      { owner: me },
    );
    me.root.incomingRequests.$jazz.push(req);
    (me.root.incomingRequests.$jazz.raw as any).append(null);

    await me.applyMigration();

    const loaded = await me.$jazz.ensureLoaded({
      resolve: {
        root: { incomingConnectionRequests: { $each: { $onError: "catch" } } },
      },
    });
    const record = (loaded.root as any).incomingConnectionRequests;
    expect(record).toBeTruthy();
    expect(recordKeys(record)).toEqual([req.$jazz.id]);
    expect(record[req.$jazz.id]?.requesterAccountID).toBe("acc-requester");
  });

  it("watcher survival: the useOutgoingRequestWatcher resolve path still yields a usable account on a null-poisoned contactBook (today's live state)", async () => {
    const me = await makeLegacyAccount();
    pushLegacyContact(me, "acc-good-1", "fp-1", "Good One", new Date("2026-01-01T00:00:00Z"));
    (me.root.contactBook.$jazz.raw as any).append(null);
    // Deliberately NOT running applyMigration — this models the live account
    // TODAY: backfill still pending (contacts absent) with the poison in place.

    // EXACT resolve object from useOutgoingRequestWatcher (handshake.ts). If
    // this ensureLoaded throws, the watcher would never reach $isLoaded on
    // the live account — report loudly before shipping.
    const loaded = await me.$jazz.ensureLoaded({
      resolve: {
        root: {
          contacts: { $each: { $onError: "catch" }, $onError: "catch" },
          contactBook: { $each: { $onError: "catch" }, $onError: "catch" },
          outgoingRequests: { $each: { request: true, $onError: "catch" } },
          incomingConnectionRequests: {
            $each: { $onError: "catch" },
            $onError: "catch",
          },
          dismissedRequests: true,
          pendingPairings: { $each: { $onError: "catch" } },
          liveInvitations: { $each: { $onError: "catch" } },
          pendingNotifications: { $each: { $onError: "catch" } },
        },
      } as any,
    });
    expect(loaded.$isLoaded).toBe(true);
    expect(loaded.root).toBeTruthy();

    // The branch-level $onError either nulls the whole contactBook or yields
    // a list with a null hole — legacyContactBookEntries tolerates both, so
    // both shapes are acceptable here.
    const cb = (loaded.root as any).contactBook;
    if (cb != null) {
      const entries = Array.from(cb as Iterable<any>);
      expect(entries.filter((e) => e != null).length).toBeLessThanOrEqual(1);
    }

    // The migration-pending read fallback and the reconcile pass must both
    // cope with this exact account state.
    expect(() => reconcileLegacyContacts(loaded)).not.toThrow();
    const fallback = listContacts(loaded);
    expect(Array.isArray(fallback)).toBe(true);
  });
});
