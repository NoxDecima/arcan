import { describe, it, expect, vi } from "vitest";
import { co, z } from "jazz-tools";
import { createJazzTestAccount } from "jazz-tools/testing";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Contact } from "@/jazz/schema/Contact";
import { ConnectionRequest } from "@/jazz/schema/ConnectionRequest";
import {
  runContactsBackfill,
  runIncomingRequestsBackfill,
  getHandshakeReport,
} from "@/jazz/backfill";
import { runHandshakeStartupTasks } from "@/jazz/handshake";

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

/**
 * Puts an account into the runtime-proven PHANTOM-KEY wedge state for `key`:
 * the raw CoMap entry points at a record CoValue created on a DIFFERENT,
 * never-linked node (no test sync server), so the key is present but the
 * record can never load on `me`'s node.
 */
async function makePhantomKey(
  me: any,
  key: "contacts" | "incomingConnectionRequests",
): Promise<string> {
  const stranger: any = await createJazzTestAccount({
    AccountSchema: ArcanAccount,
    creationProps: { name: "Stranger" },
  });
  const foreign =
    key === "contacts"
      ? co.record(z.string(), Contact).create({}, { owner: stranger })
      : co.record(z.string(), ConnectionRequest).create({}, { owner: stranger });
  (me.root.$jazz.raw as any).set(key, foreign.$jazz.id);
  return foreign.$jazz.id as string;
}

/** The EXACT resolve object from useOutgoingRequestWatcher (handshake.ts). */
const WATCHER_RESOLVE = {
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
} as any;

describe("phantom probe (counter + 3rd-launch rebuild)", () => {
  it("phantom contacts: 3 consecutive probed launches -> counter 1, 2, then rebuild (re-point, counter reset, ONE [recovery] warn) and reconcile refills from legacy", async () => {
    const { reconcileLegacyContacts } = await import("@/jazz/handshake");
    const me: any = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "PhantomStreak" },
      isCurrentActiveAccount: true,
    });
    pushLegacyContact(me, "acc-good-1", "fp-1", "Good One", new Date("2026-01-01T00:00:00Z"));
    pushLegacyContact(me, "acc-good-2", "fp-2", "Good Two", new Date("2026-01-02T00:00:00Z"));
    const legacyIDs = [
      me.root.contactBook[0].$jazz.id,
      me.root.contactBook[1].$jazz.id,
    ];
    const foreignId = await makePhantomKey(me, "contacts");

    const warnSpy = vi.spyOn(console, "warn");
    const recoveryWarns = () =>
      warnSpy.mock.calls.filter(
        (c) => typeof c[0] === "string" && c[0].includes("[recovery]"),
      );

    // Launch 1 + 2: counted skips — no rebuild, no re-point, no warn.
    expect(await runContactsBackfill(me, { phantomProbe: true })).toBe(
      "skipped-phantom-probe:1",
    );
    expect(me.root.contactsRecoveryAttempts).toBe(1);
    expect(await runContactsBackfill(me, { phantomProbe: true })).toBe(
      "skipped-phantom-probe:2",
    );
    expect(me.root.contactsRecoveryAttempts).toBe(2);
    expect(me.root.$jazz.raw.get("contacts")).toBe(foreignId);
    expect(recoveryWarns()).toHaveLength(0);

    // Launch 3: rebuild — fresh empty record, key re-pointed (LWW), counter
    // reset, exactly ONE clear [recovery] warn.
    expect(await runContactsBackfill(me, { phantomProbe: true })).toBe(
      "created",
    );
    expect(me.root.contactsRecoveryAttempts).toBe(0);
    expect(me.root.$jazz.raw.get("contacts")).not.toBe(foreignId);
    expect(recoveryWarns()).toHaveLength(1);
    expect(recoveryWarns()[0][0]).toBe(
      "[recovery] contacts record unreachable — rebuilt; legacy contacts will re-import",
    );
    warnSpy.mockRestore();

    // The startup reconcile pass then repopulates: legacy CoValues set
    // DIRECTLY (identity preserved), pins/addedAt intact.
    reconcileLegacyContacts(me);
    const contacts = await loadContacts(me);
    expect(recordKeys(contacts).sort()).toEqual(["acc-good-1", "acc-good-2"]);
    expect(contacts["acc-good-1"]?.pinnedFingerprint).toBe("fp-1");
    expect(contacts["acc-good-1"]?.$jazz.id).toBe(legacyIDs[0]);
    expect(contacts["acc-good-2"]?.$jazz.id).toBe(legacyIDs[1]);
  });

  it("slow record that finally loads: nonzero counter resets to 0, NO re-point", async () => {
    const me: any = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "SlowRecord" },
      isCurrentActiveAccount: true,
    });
    // Two earlier launches failed the probe; this launch the (healthy) record
    // is reachable again.
    me.root.$jazz.set("contactsRecoveryAttempts", 2);
    const recordId = me.root.$jazz.raw.get("contacts");

    expect(await runContactsBackfill(me, { phantomProbe: true })).toBe(
      "already-exists",
    );
    expect(me.root.contactsRecoveryAttempts).toBe(0);
    expect(me.root.$jazz.raw.get("contacts")).toBe(recordId);
  });

  it("non-counting caller (migration, default opts): phantom -> reported skip, counter NOT incremented", async () => {
    const me: any = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "PhantomMigration" },
      isCurrentActiveAccount: true,
    });
    await makePhantomKey(me, "contacts");

    // The migration-side call must never count a launch (the watcher call in
    // the same launch would double it) — report-only skip.
    expect(await runContactsBackfill(me)).toBe("skipped-phantom-probe:0");
    expect(me.root.contactsRecoveryAttempts ?? 0).toBe(0);
    expect(await runContactsBackfill(me)).toBe("skipped-phantom-probe:0");
  });

  it("phantom incomingConnectionRequests: own counter increments; 3rd launch rebuilds empty with its own [recovery] warn", async () => {
    const me: any = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "PhantomRequests" },
      isCurrentActiveAccount: true,
    });
    const foreignId = await makePhantomKey(me, "incomingConnectionRequests");

    const warnSpy = vi.spyOn(console, "warn");
    expect(await runIncomingRequestsBackfill(me, { phantomProbe: true })).toBe(
      "skipped-phantom-probe:1",
    );
    expect(me.root.incomingRequestsRecoveryAttempts).toBe(1);
    // The contacts counter is untouched — the streaks are per record.
    expect(me.root.contactsRecoveryAttempts ?? 0).toBe(0);
    expect(await runIncomingRequestsBackfill(me, { phantomProbe: true })).toBe(
      "skipped-phantom-probe:2",
    );
    expect(await runIncomingRequestsBackfill(me, { phantomProbe: true })).toBe(
      "created",
    );
    expect(me.root.incomingRequestsRecoveryAttempts).toBe(0);
    expect(me.root.$jazz.raw.get("incomingConnectionRequests")).not.toBe(
      foreignId,
    );
    const recoveryWarns = warnSpy.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("[recovery]"),
    );
    expect(recoveryWarns).toHaveLength(1);
    warnSpy.mockRestore();

    // The rebuilt record is empty and usable (requests re-arrive via the
    // inbox drain; they expire in <=7 days — no reconcile net needed).
    const loaded = await me.$jazz.ensureLoaded({
      resolve: {
        root: { incomingConnectionRequests: { $each: { $onError: "catch" } } },
      },
    });
    expect(recordKeys((loaded.root as any).incomingConnectionRequests)).toEqual(
      [],
    );
  });
});

describe("watcher second chance (runHandshakeStartupTasks + field-level $onError)", () => {
  it("heals the live account: record keys absent after a migration guard-skip -> both records created from legacy state", async () => {
    // Models the live account: migration ran against a partial root, so the
    // 2i/2j guards silently skipped and BOTH record keys are absent while
    // the legacy lists hold real data.
    const me = await makeLegacyAccount();
    pushLegacyContact(me, "acc-good-1", "fp-1", "Good One", new Date("2026-01-01T00:00:00Z"));
    pushLegacyContact(me, "acc-good-2", "fp-2", "Good Two", new Date("2026-01-02T00:00:00Z"));
    const req = makeLegacyRequest(me);

    await runHandshakeStartupTasks(me);

    const contacts = await loadContacts(me);
    expect(contacts).toBeTruthy();
    expect(recordKeys(contacts).sort()).toEqual(["acc-good-1", "acc-good-2"]);
    expect(contacts["acc-good-1"]?.pinnedFingerprint).toBe("fp-1");

    const loaded = await me.$jazz.ensureLoaded({
      resolve: {
        root: { incomingConnectionRequests: { $each: { $onError: "catch" } } },
      },
    });
    const record = (loaded.root as any).incomingConnectionRequests;
    expect(record).toBeTruthy();
    // The live (unexpired) request survives the startup prune.
    expect(recordKeys(record)).toEqual([req.$jazz.id]);
  });

  it("watcher resolve survives phantom records in BOTH keyed fields (field-level catch)", async () => {
    const me: any = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Phantom" },
      isCurrentActiveAccount: true,
    });
    await makePhantomKey(me, "contacts");
    await makePhantomKey(me, "incomingConnectionRequests");

    const loaded = await me.$jazz.ensureLoaded({ resolve: WATCHER_RESOLVE });
    expect(loaded.$isLoaded).toBe(true);
    expect(loaded.root).toBeTruthy();
  });

  it("records a startup report (outcome + timestamp per step, nothing else) and emits ONE console.info", async () => {
    const me = await makeLegacyAccount();
    pushLegacyContact(me, "acc-good-1", "fp-1", "Good One", new Date("2026-01-01T00:00:00Z"));

    const infoSpy = vi.spyOn(console, "info");
    await runHandshakeStartupTasks(me);

    const report = getHandshakeReport();
    expect(report.contactsBackfill?.outcome).toBe("created");
    expect(report.incomingRequestsBackfill?.outcome).toBe("created");
    expect(report.prune?.outcome).toBe("ok");
    expect(report.reconcile?.outcome).toBe("ok");
    for (const step of [
      "contactsBackfill",
      "incomingRequestsBackfill",
      "prune",
      "reconcile",
    ]) {
      // Tiny by contract: outcome string + timestamp — no CoValue dumps.
      expect(Object.keys(report[step]!).sort()).toEqual(["at", "outcome"]);
      expect(Number.isFinite(new Date(report[step]!.at).getTime())).toBe(true);
    }
    // Exposed for in-field diagnosis (guarded typeof window !== "undefined").
    expect((window as any).__arcanHandshakeReport).toBe(report);

    const infos = infoSpy.mock.calls.filter(
      (c) => c[0] === "[handshake] startup report",
    );
    expect(infos).toHaveLength(1);
    expect(infos[0][1]).toBe(report);
    infoSpy.mockRestore();
  });

  it("direct runner calls record their outcome too (migration-side visibility; last write wins)", async () => {
    const me: any = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "ReportRunner" },
      isCurrentActiveAccount: true,
    });
    expect(await runContactsBackfill(me)).toBe("already-exists");
    expect(getHandshakeReport().contactsBackfill?.outcome).toBe(
      "already-exists",
    );
  });

  it("pins WHY the field-level catch is required: $each-level catch alone REJECTS on a phantom record CoValue", async () => {
    const me: any = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "PhantomOldShape" },
      isCurrentActiveAccount: true,
    });
    await makePhantomKey(me, "contacts");

    // The pre-phase-4 watcher shape: $onError at $each level does NOT cover
    // the record CoValue itself (runtime-proven) — the resolve rejects and
    // the watcher would never reach $isLoaded, so no heal could ever run.
    let rejected = false;
    try {
      await me.$jazz.ensureLoaded({
        resolve: {
          root: { contacts: { $each: { $onError: "catch" } } },
        } as any,
      });
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });
});
