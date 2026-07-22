/**
 * Reusable list→record backfill runners (contact-robustness phase 4).
 *
 * The migration blocks 2i/2j (ArcanAccount.ts) used to own this logic
 * inline, which tied it to MIGRATION TIMING: on a device where `me.root` is
 * a partial proxy when the migration runs (`$jazz` exposing only
 * { id, loadingState } — the documented block-2b hazard), the guards
 * silently skipped and NOTHING outside migration ever retried. That is the
 * live-account bug: `contacts` stayed absent forever. The runners here are
 * called BOTH from the migration blocks (thin callers, preserving the
 * historical timing) AND from the watcher's once-per-launch branch
 * (handshake.ts runHandshakeStartupTasks), where the root is fully loaded —
 * the second chance that removes the timing dependency.
 *
 * Import graph: this module may import schemas + the pure planner, but NEVER
 * ArcanAccount or handshake (both import US — a cycle otherwise).
 *
 * Idempotency contract (INSIDE the runner): key presence via
 * `me.root.$jazz.has(key)` — the raw-entry check documented in
 * upsertContact (checks the raw CoMap entry without loading the referenced
 * CoValue; false for deleted keys). Chosen over a `me.root.$jazz.raw.get`
 * scan because has() already encapsulates the tombstone semantics we want
 * and is the API this codebase has verified against jazz-tools 0.20.18
 * internals; and over the old proxy-read guard (`!me.root.contacts`)
 * because in the PHANTOM-KEY state (key present, record CoValue
 * unavailable) the proxy yields a truthy unloaded stub — the old guard
 * silently skipped exactly when recovery was needed.
 *
 * Phantom probe (runtime-proven wedge state): when the key EXISTS but the
 * record CoValue fails a bounded load, we count consecutive failed launches
 * in a plain inline number on root (contactsRecoveryAttempts /
 * incomingRequestsRecoveryAttempts — deliberately NOT a CoValue ref, so the
 * recovery state cannot itself become unloadable). On the 3rd consecutive
 * failed launch the key is re-pointed (LWW) at a fresh EMPTY record (the old
 * record's co-ID is stashed in a root salvage field first) and the counter
 * reset; the startup reconcile pass (reconcileLegacyContacts) then
 * repopulates contacts from the write-frozen legacy list with pins/addedAt
 * preserved. Increment discipline: ONLY the caller that passes
 * `phantomProbe: true` (the watcher's once-per-launch branch) increments a
 * FAILED probe — the migration calls with the default (false) so one launch
 * can never double-count a failure. (Resetting is not so restricted: any
 * caller zeroes a stale streak on a successful probe or a fresh create.)
 */
import { Contact, ContactsRecord } from "./schema/Contact";
import {
  ConnectionRequest,
  IncomingConnectionRequestsRecord,
} from "./schema/ConnectionRequest";
import { planContactMigration } from "./contact-migration";

export type BackfillOutcome =
  | "created"
  | "already-exists"
  | "root-not-ready"
  | `skipped-phantom-probe:${number}`
  | `failed:${string}`;

export interface BackfillOpts {
  /**
   * When true, a failed record probe increments the recovery counter and may
   * trigger the 3rd-launch rebuild. Reserved for the once-per-launch watcher
   * call — defaults to false so no other caller can double-count a launch.
   */
  phantomProbe?: boolean;
}

/** Consecutive failed launches before the phantom record is rebuilt. */
export const PHANTOM_REBUILD_THRESHOLD = 3;
/** Bound on the phantom probe's record load (sync-server round-trip cap). */
export const PHANTOM_PROBE_TIMEOUT_MS = 10_000;

/**
 * Startup diagnostic report (phase 4): each backfill runner + the watcher's
 * prune/reconcile record their latest outcome here. Deliberately TINY —
 * outcome strings + timestamps only, never CoValue contents (privacy).
 * Mirrored to window.__arcanHandshakeReport for in-field inspection; the
 * watcher logs it once per launch via console.info after the once-per-launch
 * block completes. Last write wins per step (a migration-side runner outcome
 * is superseded by the watcher-side rerun — the later one reflects the
 * account's actual final state).
 */
export interface HandshakeReportEntry {
  outcome: string;
  at: string;
}

const handshakeReport: Record<string, HandshakeReportEntry> = {};

/**
 * Account the current report entries belong to. The report is module state,
 * so a sign-out/sign-in within one session would otherwise leak the previous
 * account's outcomes into the new account's report. The runners (the first
 * report writers on any account) clear stale entries when they see a
 * DIFFERENT account id — in place, so the window mirror keeps pointing at
 * the live object.
 */
let reportAccountID: string | undefined;

function resetReportForAccount(accountID: unknown): void {
  if (typeof accountID !== "string" || accountID === reportAccountID) return;
  reportAccountID = accountID;
  for (const step of Object.keys(handshakeReport)) {
    delete handshakeReport[step];
  }
}

export function recordHandshakeOutcome<T extends string>(
  step: string,
  outcome: T,
): T {
  handshakeReport[step] = { outcome, at: new Date().toISOString() };
  try {
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__arcanHandshakeReport =
        handshakeReport;
    }
  } catch {
    // The mirror is diagnostic best-effort only — a locked-down window
    // (frozen global, exotic embedder) must not break the runners'
    // never-rejects contract.
  }
  return outcome;
}

export function getHandshakeReport(): Record<string, HandshakeReportEntry> {
  return handshakeReport;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Local bounded-load helper. NOT handshake.ts's withTimeout — importing
 * handshake here would close an import cycle (handshake → ArcanAccount →
 * backfill). Resolves null on timeout instead of rejecting: the probe only
 * cares about "usable within the bound", and schema .load() itself settles
 * (never throws) for unavailable CoValues.
 */
async function boundedLoad<T>(load: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      load,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

interface KeyedRecordBackfillSpec {
  key: "contacts" | "incomingConnectionRequests";
  counterKey: "contactsRecoveryAttempts" | "incomingRequestsRecoveryAttempts";
  /**
   * Root field stashing the co-ID of the record a phantom rebuild re-pointed
   * away from (salvage path — see the rebuild branch).
   */
  preRebuildRefKey: "contactsPreRebuildRef" | "incomingRequestsPreRebuildRef";
  /** Step name in the startup diagnostic report. */
  reportKey: "contactsBackfill" | "incomingRequestsBackfill";
  /** Builds AND fills the record from the write-frozen legacy list. */
  buildFromLegacy: (me: any) => Promise<any>;
  createEmpty: (me: any) => any;
  loadRecord: (id: string, me: any) => Promise<any>;
  /** The single [recovery] warn on rebuild — names the old record's co-ID. */
  rebuildWarning: (previousRecordID: string) => string;
}

/** Recording wrapper — every runner outcome lands in the startup report. */
async function runKeyedRecordBackfill(
  me: any,
  spec: KeyedRecordBackfillSpec,
  opts: BackfillOpts,
): Promise<BackfillOutcome> {
  // The runners are the first report writers for any account — clear stale
  // entries left by a previously signed-in account (module state).
  resetReportForAccount(me?.$jazz?.id);
  const outcome = await runKeyedRecordBackfillInner(me, spec, opts);
  return recordHandshakeOutcome(spec.reportKey, outcome);
}

/**
 * Shared runner skeleton: root-ready guard → has()-keyed idempotency →
 * create-and-fill (set-last) when absent → phantom probe when present.
 */
async function runKeyedRecordBackfillInner(
  me: any,
  spec: KeyedRecordBackfillSpec,
  opts: BackfillOpts,
): Promise<BackfillOutcome> {
  const root = me?.root;
  const rootJazz = root?.$jazz;
  if (
    !root ||
    typeof rootJazz?.set !== "function" ||
    typeof rootJazz?.has !== "function"
  ) {
    // Partial root (the block-2b hazard) — nothing we can safely read or
    // write. The watcher-side call retries on a fully-loaded root.
    return "root-not-ready";
  }

  if (!rootJazz.has(spec.key)) {
    try {
      const record = await spec.buildFromLegacy(me);
      // Set LAST — a crash mid-fill leaves the key absent and the whole
      // backfill re-runs; a partially-filled record is never published.
      rootJazz.set(spec.key, record);
      if ((root[spec.counterKey] ?? 0) > 0) rootJazz.set(spec.counterKey, 0);
      return "created";
    } catch (e) {
      // Same recovery contract as the old migration blocks: skip WITHOUT
      // setting the field; the next launch retries.
      console.warn(`[backfill] ${spec.key} backfill skipped (will retry):`, e);
      return `failed:${errorMessage(e)}`;
    }
  }

  // Key present — probe whether the record CoValue is actually usable
  // (phantom-key wedge: present key, unavailable record).
  try {
    const counter =
      typeof root[spec.counterKey] === "number" ? root[spec.counterKey] : 0;
    const usable = await probeRecordUsable(me, spec);
    if (usable) {
      // Successful probe resets a nonzero phantom streak (slow record that
      // finally synced — NOT a phantom; never re-point it).
      if (counter > 0) rootJazz.set(spec.counterKey, 0);
      return "already-exists";
    }
    if (!opts.phantomProbe) {
      // Non-counting caller (migration): report the standing streak only —
      // incrementing here too would double-count a launch.
      return `skipped-phantom-probe:${counter}`;
    }
    const attempts = counter + 1;
    if (attempts >= PHANTOM_REBUILD_THRESHOLD) {
      // 3rd consecutive failed launch: stash the old record's co-ID (a
      // future salvage path can re-import its entries if the record ever
      // becomes loadable again), then re-point the key (LWW) at a fresh
      // EMPTY record and reset the streak. What each side actually gets
      // back: for contacts the startup reconcile pass repopulates from the
      // write-frozen legacy list (pins/addedAt preserved) — contacts added
      // AFTER the list was frozen on other devices live only in the old
      // record and may need re-adding. For requests, entries already
      // persisted in the old record are NOT recovered here; what IS safe:
      // the inbox dispatcher refuses to consume messages while its target
      // record is unusable, so undelivered requests stay durable in the
      // inbox and process once this rebuilt record is usable.
      const previousID = rootJazz.raw?.get?.(spec.key);
      if (typeof previousID === "string") {
        rootJazz.set(spec.preRebuildRefKey, previousID);
      }
      rootJazz.set(spec.key, spec.createEmpty(me));
      rootJazz.set(spec.counterKey, 0);
      console.warn(
        spec.rebuildWarning(
          typeof previousID === "string" ? previousID : "unknown",
        ),
      );
      return "created";
    }
    rootJazz.set(spec.counterKey, attempts);
    return `skipped-phantom-probe:${attempts}`;
  } catch (e) {
    console.warn(`[backfill] ${spec.key} phantom probe failed:`, e);
    return `failed:${errorMessage(e)}`;
  }
}

/**
 * Usability probe: fast path via the subscription proxy ($isLoaded === true —
 * NOT truthiness: a phantom key reads as a truthy unloaded stub), then a
 * bounded schema .load() of the raw ref ID. A key whose raw value is not a
 * well-formed co-ID is unusable by definition (counts toward rebuild).
 */
async function probeRecordUsable(
  me: any,
  spec: KeyedRecordBackfillSpec,
): Promise<boolean> {
  const viaProxy = me?.root?.[spec.key];
  if (viaProxy?.$isLoaded === true) return true;
  const rawId = me.root.$jazz.raw?.get?.(spec.key);
  if (typeof rawId !== "string" || !rawId.startsWith("co_")) return false;
  const loaded = await boundedLoad(
    spec.loadRecord(rawId, me),
    PHANTOM_PROBE_TIMEOUT_MS,
  );
  return (loaded as any)?.$isLoaded === true;
}

/**
 * contacts (list → keyed record) backfill — extracted from migration block 2i.
 *
 * RAW-SCAN MECHANISM (falsy-entry fix, 2026-07-22) — do NOT "simplify" this
 * back to a deep ensureLoaded of the list: a falsy (null) raw entry in the
 * legacy CoList makes `contactBook: { $each: { $onError: "catch" } }` REJECT
 * in jazz-tools 0.20.18. SubscriptionScope.loadCoListKey
 * (node_modules/jazz-tools/src/tools/subscribe/SubscriptionScope.ts:1117-1129)
 * files an index-keyed "ref on position N is required but missing" validation
 * error that $onError: "catch" CANNOT suppress — unlike loadCoMapKey
 * (:1047-1055), which pre-adds caught keys to skipInvalidKeys, loadCoListKey
 * never adds index keys. One raw null therefore wedged this backfill on EVERY
 * startup (live-account bug). $onError only ever suppressed entries that DID
 * resolve but errored — it never covered falsy raw entries.
 *
 * Mechanism: shallow-load the list CoValue only, filter its raw id array to
 * ref-shaped strings (drops null/bogus poisons), then load each entry
 * individually with Contact.load — which SETTLES (never throws); a
 * never-synced/unavailable entry comes back not-loaded and is dropped by the
 * $isLoaded filter. Skipped entries heal on a later launch via the startup
 * reconcile pass (reconcileLegacyContacts in handshake.ts), pin copied
 * verbatim.
 *
 * Dedup policy lives in planContactMigration (unit-tested): latest entry wins
 * per account ID, EXCEPT fingerprint conflicts where the OLDEST pin is kept
 * (TOFU) and the conflict is flagged on the kept Contact.
 */
async function buildContactsRecordFromLegacy(me: any): Promise<any> {
  const loaded = await me.$jazz.ensureLoaded({
    resolve: { root: { contactBook: true } },
  });
  const rawIDs = (
    ((loaded.root as any).contactBook?.$jazz.raw.asArray() ?? []) as unknown[]
  ).filter((v): v is string => typeof v === "string" && v.startsWith("co_"));
  const entries = (
    await Promise.all(rawIDs.map((id) => Contact.load(id, { loadAs: me })))
  ).filter((c: any) => c?.$isLoaded === true) as any[];
  // The planner's views mapping below drops any remaining malformed shapes
  // (non-string IDs/pins); plan indexes stay consistent because they are
  // taken over THIS loaded-and-filtered array.
  const views = entries
    .map((c, index) => ({
      contactAccountID: c?.contactAccountID as string,
      pinnedFingerprint: c?.pinnedFingerprint as string,
      addedAtMs: (() => {
        const t = new Date(c.addedAt).getTime();
        return c?.addedAt && Number.isFinite(t) ? t : 0;
      })(),
      index,
    }))
    .filter(
      (v) =>
        typeof v.contactAccountID === "string" &&
        typeof v.pinnedFingerprint === "string",
    );
  const plan = planContactMigration(views);
  const record = ContactsRecord.create({}, { owner: me });
  for (const [accountID, index] of Object.entries(plan.keepIndexByAccountID)) {
    const kept = entries[index];
    const conflict = plan.conflictByAccountID[accountID];
    if (conflict && typeof kept?.$jazz?.set === "function") {
      kept.$jazz.set("fingerprintConflict", true);
      kept.$jazz.set("conflictingFingerprint", conflict.observedFingerprint);
    }
    record.$jazz.set(accountID, kept);
  }
  return record;
}

/**
 * incomingConnectionRequests (list → keyed record) backfill — extracted from
 * migration block 2j. Same raw-scan mechanism as the contacts builder above
 * (see its docblock): shallow-load the list, filter raw ids, load each
 * request individually (settles, never throws), keep loaded ones. Keyed by
 * request CoValue ID — historical drain-race duplicates (FM2) collapse
 * because same-key sets converge. Dropping an unloadable request is
 * acceptable (requests expire in ≤7 days); unlike contacts (TOFU pins =
 * security state, healed later by reconcileLegacyContacts), requests need no
 * reconcile net.
 */
async function buildIncomingRequestsRecordFromLegacy(me: any): Promise<any> {
  const loaded = await me.$jazz.ensureLoaded({
    resolve: { root: { incomingRequests: true } },
  });
  const rawIDs = (
    ((loaded.root as any).incomingRequests?.$jazz.raw.asArray() ??
      []) as unknown[]
  ).filter((v): v is string => typeof v === "string" && v.startsWith("co_"));
  const entries = (
    await Promise.all(
      rawIDs.map((id) => ConnectionRequest.load(id, { loadAs: me })),
    )
  ).filter((r: any) => r?.$isLoaded === true) as any[];
  const record = IncomingConnectionRequestsRecord.create({}, { owner: me });
  for (const r of entries) {
    record.$jazz.set(r.$jazz.id as string, r);
  }
  return record;
}

const CONTACTS_SPEC: KeyedRecordBackfillSpec = {
  key: "contacts",
  counterKey: "contactsRecoveryAttempts",
  preRebuildRefKey: "contactsPreRebuildRef",
  reportKey: "contactsBackfill",
  buildFromLegacy: buildContactsRecordFromLegacy,
  createEmpty: (me: any) => ContactsRecord.create({}, { owner: me }),
  loadRecord: (id: string, me: any) =>
    ContactsRecord.load(id as any, { loadAs: me }),
  rebuildWarning: (previousRecordID: string) =>
    `[recovery] contacts record unreachable — rebuilt; contacts from your original list re-import automatically; contacts added after the robustness update on other devices may need re-adding (previous record: ${previousRecordID})`,
};

const INCOMING_REQUESTS_SPEC: KeyedRecordBackfillSpec = {
  key: "incomingConnectionRequests",
  counterKey: "incomingRequestsRecoveryAttempts",
  preRebuildRefKey: "incomingRequestsPreRebuildRef",
  reportKey: "incomingRequestsBackfill",
  buildFromLegacy: buildIncomingRequestsRecordFromLegacy,
  createEmpty: (me: any) =>
    IncomingConnectionRequestsRecord.create({}, { owner: me }),
  loadRecord: (id: string, me: any) =>
    IncomingConnectionRequestsRecord.load(id as any, { loadAs: me }),
  rebuildWarning: (previousRecordID: string) =>
    `[recovery] incomingConnectionRequests record unreachable — rebuilt; pending requests preserved in the inbox will process once the record is usable (previous record: ${previousRecordID})`,
};

export async function runContactsBackfill(
  me: any,
  opts: BackfillOpts = {},
): Promise<BackfillOutcome> {
  return runKeyedRecordBackfill(me, CONTACTS_SPEC, opts);
}

export async function runIncomingRequestsBackfill(
  me: any,
  opts: BackfillOpts = {},
): Promise<BackfillOutcome> {
  return runKeyedRecordBackfill(me, INCOMING_REQUESTS_SPEC, opts);
}
