import { describe, it, expect } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Contact } from "@/jazz/schema/Contact";
import { ConnectionRequest } from "@/jazz/schema/ConnectionRequest";
import {
  runContactsBackfill,
  runIncomingRequestsBackfill,
} from "@/jazz/backfill";

/**
 * Integration tests (real Jazz runtime) for the extracted 2i/2j backfill
 * runners (contact-robustness phase 4).
 *
 * The runners carry the migration blocks' logic verbatim (raw-scan, planner,
 * conflict flags, record fill, set-last) but are callable OUTSIDE migration
 * timing — the watcher's once-per-launch branch is the second chance that
 * heals accounts whose migration ran against a partial root (the live-account
 * bug: `typeof me.root.$jazz?.set !== "function"` at migration time silently
 * guard-skips blocks 2i/2j, and nothing ever retried outside migration).
 *
 * Idempotency contract lives INSIDE the runner via `me.root.$jazz.has(key)`
 * (raw-entry presence, no child load — the documented check from
 * upsertContact). A proxy-read guard (`!me.root.contacts`) would be wrong
 * here: in the phantom-key state the proxy yields a truthy unloaded stub and
 * the old migration guard silently skipped — exactly the wedge this phase
 * covers.
 */

/**
 * A fresh test account gets the new record fields at root init (block 2).
 * Delete them (both optional) to model the live-account state: root present,
 * record keys ABSENT (migration guard-skipped), legacy lists populated.
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

function makeLegacyRequest(me: any): any {
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
  return req;
}

/** Record keys without the proxy's $-prefixed members. */
function recordKeys(record: any): string[] {
  return Object.keys(record ?? {}).filter((k) => !k.startsWith("$"));
}

async function loadContacts(me: any): Promise<any> {
  const loaded = await me.$jazz.ensureLoaded({
    resolve: { root: { contacts: { $each: { $onError: "catch" } } } },
  });
  return (loaded.root as any).contacts;
}

describe("runContactsBackfill (extracted 2i)", () => {
  it("key absent + legacy contacts -> 'created' with planner-migrated entries (raw-scan poison tolerance intact)", async () => {
    const me = await makeLegacyAccount();
    pushLegacyContact(me, "acc-good-1", "fp-1", "Good One", new Date("2026-01-01T00:00:00Z"));
    pushLegacyContact(me, "acc-good-2", "fp-2", "Good Two", new Date("2026-01-02T00:00:00Z"));
    // The live-account poison: a falsy raw entry — must stay survivable
    // (raw-scan mechanism carried over verbatim from block 2i).
    (me.root.contactBook.$jazz.raw as any).append(null);

    const outcome = await runContactsBackfill(me);
    expect(outcome).toBe("created");

    const contacts = await loadContacts(me);
    expect(contacts).toBeTruthy();
    expect(recordKeys(contacts).sort()).toEqual(["acc-good-1", "acc-good-2"]);
    expect(contacts["acc-good-1"]?.pinnedFingerprint).toBe("fp-1");
    expect(contacts["acc-good-2"]?.displayNameLocal).toBe("Good Two");
  });

  it("duplicate account with differing fingerprints -> TOFU pin kept (oldest), conflict flagged (planner + conflict flags verbatim)", async () => {
    const me = await makeLegacyAccount();
    pushLegacyContact(me, "acc-dup", "fp-old", "Dup Old", new Date("2026-01-01T00:00:00Z"));
    pushLegacyContact(me, "acc-dup", "fp-new", "Dup New", new Date("2026-01-05T00:00:00Z"));

    const outcome = await runContactsBackfill(me);
    expect(outcome).toBe("created");

    const contacts = await loadContacts(me);
    expect(recordKeys(contacts)).toEqual(["acc-dup"]);
    expect(contacts["acc-dup"]?.pinnedFingerprint).toBe("fp-old");
    expect(contacts["acc-dup"]?.fingerprintConflict).toBe(true);
    expect(contacts["acc-dup"]?.conflictingFingerprint).toBe("fp-new");
  });

  it("second run -> 'already-exists' (has()-based idempotency inside the runner), record untouched", async () => {
    const me = await makeLegacyAccount();
    pushLegacyContact(me, "acc-good-1", "fp-1", "Good One", new Date("2026-01-01T00:00:00Z"));

    expect(await runContactsBackfill(me)).toBe("created");
    const idAfterCreate = me.root.$jazz.raw.get("contacts");
    expect(await runContactsBackfill(me)).toBe("already-exists");
    expect(me.root.$jazz.raw.get("contacts")).toBe(idAfterCreate);
  });

  it("fresh account (root init already created the record) -> 'already-exists'", async () => {
    const me: any = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Fresh" },
      isCurrentActiveAccount: true,
    });
    expect(await runContactsBackfill(me)).toBe("already-exists");
  });

  it("partial/absent root -> 'root-not-ready' (the live account's migration-time state; no throw, no write)", async () => {
    expect(await runContactsBackfill({} as any)).toBe("root-not-ready");
    expect(await runContactsBackfill({ root: {} } as any)).toBe("root-not-ready");
    // The documented partial-root proxy: $jazz exposes only { id, loadingState }.
    expect(
      await runContactsBackfill({
        root: { $jazz: { id: "co_zPartial", loadingState: "loading" } },
      } as any),
    ).toBe("root-not-ready");
  });
});

describe("runIncomingRequestsBackfill (extracted 2j)", () => {
  it("key absent + legacy requests (with a raw NULL poison) -> 'created', keyed by request CoValue ID", async () => {
    const me = await makeLegacyAccount();
    const req = makeLegacyRequest(me);
    (me.root.incomingRequests.$jazz.raw as any).append(null);

    const outcome = await runIncomingRequestsBackfill(me);
    expect(outcome).toBe("created");

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

  it("second run -> 'already-exists'", async () => {
    const me = await makeLegacyAccount();
    makeLegacyRequest(me);
    expect(await runIncomingRequestsBackfill(me)).toBe("created");
    expect(await runIncomingRequestsBackfill(me)).toBe("already-exists");
  });

  it("partial/absent root -> 'root-not-ready'", async () => {
    expect(await runIncomingRequestsBackfill({} as any)).toBe("root-not-ready");
    expect(
      await runIncomingRequestsBackfill({
        root: { $jazz: { id: "co_zPartial", loadingState: "loading" } },
      } as any),
    ).toBe("root-not-ready");
  });
});
