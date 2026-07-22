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
 * failed launch the key is re-pointed (LWW) at a fresh EMPTY record and the
 * counter reset; the startup reconcile pass (reconcileLegacyContacts) then
 * repopulates contacts from the write-frozen legacy list with pins/addedAt
 * preserved. Increment discipline: ONLY the caller that passes
 * `phantomProbe: true` (the watcher's once-per-launch branch) increments —
 * the migration calls with the default (false) so one launch can never
 * double-count.
 */
import { co, z } from "jazz-tools";
import { Contact } from "./schema/Contact";
import { ConnectionRequest } from "./schema/ConnectionRequest";
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

const ContactsRecord = co.record(z.string(), Contact);
const IncomingRequestsRecord = co.record(z.string(), ConnectionRequest);

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
  /** Builds AND fills the record from the write-frozen legacy list. */
  buildFromLegacy: (me: any) => Promise<any>;
  createEmpty: (me: any) => any;
  loadRecord: (id: string, me: any) => Promise<any>;
  rebuildWarning: string;
}

/**
 * Shared runner skeleton: root-ready guard → has()-keyed idempotency →
 * create-and-fill (set-last) when absent → phantom probe when present.
 */
async function runKeyedRecordBackfill(
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
      // 3rd consecutive failed launch: re-point the key (LWW) at a fresh
      // EMPTY record and reset the streak. For contacts the startup
      // reconcile pass repopulates from the write-frozen legacy list (pins/
      // addedAt preserved); requests re-arrive via the inbox drain (they
      // expire in ≤7 days).
      rootJazz.set(spec.key, spec.createEmpty(me));
      rootJazz.set(spec.counterKey, 0);
      console.warn(spec.rebuildWarning);
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
  const record = IncomingRequestsRecord.create({}, { owner: me });
  for (const r of entries) {
    record.$jazz.set(r.$jazz.id as string, r);
  }
  return record;
}

const CONTACTS_SPEC: KeyedRecordBackfillSpec = {
  key: "contacts",
  counterKey: "contactsRecoveryAttempts",
  buildFromLegacy: buildContactsRecordFromLegacy,
  createEmpty: (me: any) => ContactsRecord.create({}, { owner: me }),
  loadRecord: (id: string, me: any) =>
    ContactsRecord.load(id as any, { loadAs: me }),
  rebuildWarning:
    "[recovery] contacts record unreachable — rebuilt; legacy contacts will re-import",
};

const INCOMING_REQUESTS_SPEC: KeyedRecordBackfillSpec = {
  key: "incomingConnectionRequests",
  counterKey: "incomingRequestsRecoveryAttempts",
  buildFromLegacy: buildIncomingRequestsRecordFromLegacy,
  createEmpty: (me: any) => IncomingRequestsRecord.create({}, { owner: me }),
  loadRecord: (id: string, me: any) =>
    IncomingRequestsRecord.load(id as any, { loadAs: me }),
  rebuildWarning:
    "[recovery] incomingConnectionRequests record unreachable — rebuilt; live requests will re-arrive via the inbox drain",
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
