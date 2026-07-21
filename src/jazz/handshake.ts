/**
 * Handshake module — contact-robustness slice (spec:
 * docs/superpowers/specs/2026-07-20-contact-robustness-design.md).
 *
 * Owns the account-level handshake facts:
 *  - the contact book (me.root.contacts, keyed by account ID) via
 *    upsertContact — the ONLY place a Contact is written;
 *  - outbound connection requests (me.root.outgoingRequests) via
 *    sendConnectionRequest — the ONLY request-creation path (both channels);
 *  - the app-level approval watcher (useOutgoingRequestWatcher) that turns
 *    approvedAt/deniedAt stamps into durable contact/status state — replacing
 *    the tab-lifetime poll in /invite (FM3/FM4).
 */
import { useEffect, useRef } from "react";
import { Account } from "jazz-tools";
import { useAccount } from "jazz-tools/react";
import { Contact } from "./schema/Contact";
import {
  mintConnectionRequest,
  deliverConnectionRequest,
  GROUP_REQUEST_TTL_MS,
} from "./invitations";
import { OutgoingConnectionRequest } from "./schema/OutgoingConnectionRequest";
import { ArcanAccount } from "./schema/ArcanAccount";

export type UpsertContactResult =
  | "created"
  | "unchanged"
  | "conflict"
  | "unavailable";

export interface ContactData {
  contactAccountID: string;
  fingerprint: string;
  displayName: string;
}

/**
 * Idempotent, TOFU-aware contact write, keyed by account ID.
 *
 * - Absent → create (pin fingerprint now — TOFU at handshake time).
 * - Present, same fingerprint → no-op (displayNameLocal stays frozen at the
 *   original approval; live-name propagation is a separate product decision).
 * - Present, DIFFERENT fingerprint → keep the old pin, set
 *   fingerprintConflict + conflictingFingerprint for the profile safety-number
 *   section to surface. NEVER overwrites pinnedFingerprint (threat model §6).
 * - Present but entry not yet loaded → "unavailable" (caller should retry
 *   once the CoValue syncs). The TOFU pin is NEVER replaced; the invariant
 *   holds intrinsically regardless of caller resolve discipline.
 *
 * Key-presence check: `contacts.$jazz.has(key)` (CoMapJazzApi.has, verified
 * against node_modules/jazz-tools/dist/tools/coValues/coMap.d.ts line 257 and
 * chunk-MIPBSAS7.js line 826). It checks the raw CoMap entry without loading
 * the referenced CoValue — returns true when the key is set and not deleted,
 * even when the entry value is null/unloaded.
 */
export function upsertContact(
  me: Account,
  data: ContactData,
): UpsertContactResult {
  // Input guard (FM4 e2e finding, 2026-07-21): a malformed caller snapshot
  // (e.g. fields read off a foreign CoValue through the ConnectionRequest
  // schema — all undefined) must never mint a Contact keyed `undefined`.
  // Nothing is written, so "unavailable" (caller may retry) is honest.
  if (
    typeof data.contactAccountID !== "string" ||
    data.contactAccountID.length === 0 ||
    typeof data.fingerprint !== "string" ||
    data.fingerprint.length === 0
  ) {
    return "unavailable";
  }
  const contacts = (me as any).root?.contacts;
  if (!contacts || typeof contacts.$jazz?.set !== "function") {
    return "unavailable";
  }

  // Guard: key present in the record but entry CoValue not yet loaded.
  // contacts[key] is null/undefined while unloaded (proxy returns raw value),
  // but contacts.$jazz.has(key) is true — creating here would silently
  // re-point the key at a new Contact, breaking the TOFU pin.
  if (contacts.$jazz.has(data.contactAccountID)) {
    const existing = contacts[data.contactAccountID];
    if (!existing) {
      // Entry key is present but the Contact CoValue isn't loaded yet.
      return "unavailable";
    }
    if (existing.pinnedFingerprint === data.fingerprint) return "unchanged";
    if (typeof existing.$jazz?.set === "function") {
      existing.$jazz.set("fingerprintConflict", true);
      existing.$jazz.set("conflictingFingerprint", data.fingerprint);
    }
    return "conflict";
  }

  contacts.$jazz.set(
    data.contactAccountID,
    Contact.create(
      {
        contactAccountID: data.contactAccountID,
        pinnedFingerprint: data.fingerprint,
        displayNameLocal: data.displayName,
        addedAt: new Date(),
      },
      { owner: me },
    ),
  );
  return "created";
}

/**
 * Migration-pending READ fallback (review amendment, 2026-07-21).
 *
 * The migration's contacts backfill retries forever when a legacy contact
 * ref is permanently unavailable — for such an account me.root.contacts
 * stays ABSENT indefinitely. Absent (undefined/null) is NOT the same as an
 * empty record: it means "backfill pending", and readers must fall back to
 * the legacy contactBook CoList so the user doesn't see an empty contact
 * book. Read-only — the legacy list is write-frozen from this slice on.
 */
function legacyContactBookEntries(me: any): any[] {
  const legacy = me?.root?.contactBook;
  if (!legacy) return [];
  try {
    return (Array.from(legacy as Iterable<any>) as any[]).filter(
      (c: any) => c && typeof c.contactAccountID === "string",
    );
  } catch {
    return [];
  }
}

/**
 * All contacts, sorted by addedAt (record iteration order is not stable).
 * Falls back to the legacy contactBook while the migration backfill is
 * pending (me.root.contacts absent — see legacyContactBookEntries).
 */
export function listContacts(me: any): any[] {
  const contacts = me?.root?.contacts;
  const entries =
    contacts == null
      ? legacyContactBookEntries(me)
      : Object.values(contacts as Record<string, any>).filter(
          (c: any) => c && typeof c.contactAccountID === "string",
        );
  return entries.sort(
    (a: any, b: any) =>
      new Date(a.addedAt ?? 0).getTime() - new Date(b.addedAt ?? 0).getTime(),
  );
}

/**
 * Keyed lookup. Returns undefined when absent or not loaded. Same
 * migration-pending fallback as listContacts (linear scan of the legacy
 * list — matches the pre-record readers' behavior).
 */
export function getContact(me: any, accountID: string): any | undefined {
  const contacts = me?.root?.contacts;
  if (contacts == null) {
    return legacyContactBookEntries(me).find(
      (c: any) => c.contactAccountID === accountID,
    );
  }
  const c = contacts[accountID];
  return c && typeof c.contactAccountID === "string" ? c : undefined;
}

/**
 * Legacy-list lookup, REGARDLESS of record presence (repair affordance,
 * migration-review carry-over 2026-07-21).
 *
 * The migration's concurrent-two-device race can strand a contact that
 * exists ONLY in the legacy contactBook: both devices backfill, the LWW
 * loser's `contacts` snapshot wins the record ref, and any entry the loser's
 * snapshot missed is gone from the RECORD while still sitting in the legacy
 * list. `getContact` won't see it (the record is present, so no fallback) —
 * correct, because the record is authoritative for "is this a contact".
 *
 * The repair affordance uses this lookup so that, when re-adding such a
 * counterpart, it copies the stranded entry's pinnedFingerprint — a
 * legitimate TOFU pin, strictly older than any re-derivation from the live
 * account — instead of re-pinning the counterpart's CURRENT key.
 */
export function getLegacyContact(me: any, accountID: string): any | undefined {
  return legacyContactBookEntries(me).find(
    (c: any) => c.contactAccountID === accountID,
  );
}

/** App-side ack timeout — Inbox sendMessage has NONE upstream (canon §2a). */
export const REQUEST_ACK_TIMEOUT_MS = 15_000;
/** Request expiry floor: 7 days from send, decoupled from invitation TTL (FM9). */
export const REQUEST_MIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export interface CounterpartSnapshot {
  accountID: string;
  fingerprint: string;
  displayName: string;
}

export interface SendConnectionRequestOpts {
  /** Which app flow initiated this ("invite" screen or "group" members). */
  channel: "invite" | "group";
  /** ConnectionRequest.channel — how the recipient's UI surfaces it. */
  requestChannel: "qr" | "link" | "group";
  invitationID?: string;
  invitationExpiresAt?: Date;
}

export type SendConnectionRequestResult =
  | { outcome: "already-contact" }
  | { outcome: "already-pending"; entry: any }
  | { outcome: "sent"; entry: any }
  | { outcome: "send-failed"; entry: any }
  | { outcome: "unavailable" };

/**
 * THE single connection-request creation path (both channels — FM1/FM8):
 * 1. contactBook check → "already-contact" (no send);
 * 2. live pending entry check → "already-pending" (no send);
 * 3. mint locally + write the durable pending entry FIRST;
 * 4. deliver via Inbox, awaiting the end-to-end ack under an app timeout;
 * 5. ack → deliveredAt; failure/timeout → status "failed" (watcher retries).
 */
export async function sendConnectionRequest(
  me: Account,
  counterpart: CounterpartSnapshot,
  opts: SendConnectionRequestOpts,
): Promise<SendConnectionRequestResult> {
  const outgoing = (me as any).root?.outgoingRequests;
  if (!outgoing || typeof outgoing.$jazz?.set !== "function") {
    return { outcome: "unavailable" };
  }

  if (getContact(me, counterpart.accountID)) {
    return { outcome: "already-contact" };
  }

  // Present-but-unloaded guard (mirrors upsertContact): $jazz.has(key) stays
  // true while the proxy read is still null because the entry CoValue hasn't
  // loaded yet. Minting here would silently re-point the key at a fresh
  // entry, orphaning the durable pending request — surface "unavailable" and
  // let the caller retry after sync.
  if (
    outgoing.$jazz?.has?.(counterpart.accountID) &&
    !outgoing[counterpart.accountID]
  ) {
    return { outcome: "unavailable" };
  }

  const existing = outgoing[counterpart.accountID];
  if (existing && existing.status === "pending" && !existing.archivedAt) {
    const expMs = existing.request?.expiresAt
      ? new Date(existing.request.expiresAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (expMs > Date.now()) {
      return { outcome: "already-pending", entry: existing };
    }
  }

  const now = new Date();
  const expiresAt =
    opts.channel === "group"
      ? new Date(now.getTime() + GROUP_REQUEST_TTL_MS)
      : new Date(
          Math.max(
            opts.invitationExpiresAt
              ? new Date(opts.invitationExpiresAt).getTime()
              : 0,
            now.getTime() + REQUEST_MIN_TTL_MS,
          ),
        );

  const request = mintConnectionRequest(
    me,
    counterpart.accountID,
    opts.requestChannel,
    { invitationID: opts.invitationID, expiresAt },
  );

  const entry = OutgoingConnectionRequest.create(
    {
      request,
      counterpartAccountID: counterpart.accountID,
      counterpartFingerprint: counterpart.fingerprint,
      counterpartDisplayName: counterpart.displayName,
      channel: opts.channel,
      sentAt: now,
      status: "pending",
    },
    { owner: me },
  );
  // Durable intent FIRST: a crash/reload between here and the ack leaves a
  // pending entry the watcher can observe and retry — never a silent loss.
  outgoing.$jazz.set(counterpart.accountID, entry);

  try {
    await withTimeout(
      deliverConnectionRequest(me, counterpart.accountID, request),
      REQUEST_ACK_TIMEOUT_MS,
    );
    (entry as any).$jazz.set("deliveredAt", new Date());
    return { outcome: "sent", entry };
  } catch (e) {
    console.warn("[handshake] request delivery failed — will retry:", e);
    (entry as any).$jazz.set("status", "failed");
    return { outcome: "send-failed", entry };
  }
}

export interface OutgoingEntryStamps {
  status: "pending" | "approved" | "denied" | "failed" | "expired";
  archivedAtMs?: number;
  approvedAtMs?: number;
  deniedAtMs?: number;
  expiresAtMs?: number;
}

export type OutgoingAction = "approve" | "deny" | "expire" | "none";

/**
 * Resolve what to do after a successful upsertContact during an approve
 * transition (sanctioned deviation from the plan snippet, which archived
 * unconditionally — see the DEVIATION comment in useOutgoingRequestWatcher).
 *
 * "unavailable" → "retry": the contacts record or the keyed entry hasn't
 *   synced yet, so nothing was written. Leave the entry pending; the reactive
 *   effect re-runs on the next render/sync tick and retries.
 * "created" | "unchanged" | "conflict" → "archive": the contact fact is
 *   durably recorded (conflict keeps the old TOFU pin + sets the flag), so
 *   the approval is fully consumed and the entry can be archived.
 *
 * Exported for test-pinning — this is the only place "unavailable" prevents
 * archival; a caller that ignores it creates a silent FM3 loss.
 */
export function resolveApproveOutcome(
  upsertResult: UpsertContactResult,
): "archive" | "retry" {
  if (upsertResult === "unavailable") return "retry";
  return "archive";
}

/**
 * Pure state machine for a durable outgoing entry. Priority:
 * archived → inert; approval stamp → approve (wins over denial + expiry,
 * mirroring pairing's approve-wins rule); denial stamp → deny; past request
 * expiry → expire. "failed" is NOT handled here — re-sends run on
 * launch/reconnect, never as a reactive transition (no hot retry loops).
 */
export function computeOutgoingAction(
  entry: OutgoingEntryStamps,
  nowMs: number,
): OutgoingAction {
  if (entry.archivedAtMs !== undefined) return "none";
  if (entry.status !== "pending") return "none";
  if (entry.approvedAtMs !== undefined) return "approve";
  if (entry.deniedAtMs !== undefined) return "deny";
  if (entry.expiresAtMs !== undefined && entry.expiresAtMs <= nowMs) {
    return "expire";
  }
  return "none";
}

/** Retention for settled/expired incoming requests and stale notifications (spec §5). */
export const SETTLED_REQUEST_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function shouldPruneIncomingRequest(
  req: { approvedAtMs?: number; deniedAtMs?: number; expiresAtMs?: number },
  nowMs: number,
): boolean {
  const settledAtMs = req.approvedAtMs ?? req.deniedAtMs;
  if (settledAtMs !== undefined) {
    return nowMs - settledAtMs > SETTLED_REQUEST_RETENTION_MS;
  }
  if (req.expiresAtMs !== undefined && req.expiresAtMs <= nowMs) {
    return nowMs - req.expiresAtMs > SETTLED_REQUEST_RETENTION_MS;
  }
  return false;
}

/**
 * Prune predicate for pendingNotifications entries (carried review item 1).
 * Entries older than 30 days are permanently-undeliverable bookkeeping — any
 * counterpart whose notification we couldn't deliver in 30 days has long
 * drifted away. Same retention constant as settled requests.
 */
export function shouldPrunePendingNotification(
  notification: { createdAtMs: number },
  nowMs: number,
): boolean {
  return nowMs - notification.createdAtMs > SETTLED_REQUEST_RETENTION_MS;
}

/**
 * Startup pruning (spec §5): settled incoming requests past retention,
 * expired pairing ceremonies, revoked/expired invitations, and stale
 * pendingNotifications entries (carried review item 1 — permanently-
 * undeliverable after 30 days). All single-writer state — no cross-device
 * coordination needed.
 */
export function pruneHandshakeState(me: any): void {
  const nowMs = Date.now();

  const incoming = me?.root?.incomingConnectionRequests;
  if (incoming && typeof incoming.$jazz?.delete === "function") {
    for (const [id, r] of Object.entries(incoming as Record<string, any>)) {
      if (id === "$jazz" || !r) continue;
      const prune = shouldPruneIncomingRequest(
        {
          approvedAtMs: r.approvedAt
            ? new Date(r.approvedAt).getTime()
            : undefined,
          deniedAtMs: r.deniedAt ? new Date(r.deniedAt).getTime() : undefined,
          expiresAtMs: r.expiresAt
            ? new Date(r.expiresAt).getTime()
            : undefined,
        },
        nowMs,
      );
      if (!prune) continue;
      incoming.$jazz.delete(id);
      const dismissed = me?.root?.dismissedRequests;
      if (
        dismissed?.[id] &&
        typeof dismissed.$jazz?.delete === "function"
      ) {
        dismissed.$jazz.delete(id);
      }
    }
  }

  const pairings = me?.root?.pendingPairings;
  if (pairings && typeof pairings.$jazz?.remove === "function") {
    pairings.$jazz.remove(
      (p: any) => p?.expiresAt && new Date(p.expiresAt).getTime() < nowMs,
    );
  }

  const invites = me?.root?.liveInvitations;
  if (invites && typeof invites.$jazz?.remove === "function") {
    invites.$jazz.remove(
      (i: any) =>
        !!i?.revokedAt ||
        (i?.expiresAt && new Date(i.expiresAt).getTime() < nowMs),
    );
  }

  const notifications = me?.root?.pendingNotifications;
  if (notifications && typeof notifications.$jazz?.delete === "function") {
    for (const [key, n] of Object.entries(
      notifications as Record<string, any>,
    )) {
      if (key === "$jazz" || !n) continue;
      const createdAtMs = n.createdAt
        ? new Date(n.createdAt).getTime()
        : undefined;
      if (
        createdAtMs !== undefined &&
        shouldPrunePendingNotification({ createdAtMs }, nowMs)
      ) {
        notifications.$jazz.delete(key);
      }
    }
  }
}

/**
 * App-level approval watcher — mounted ONCE in App.tsx beside the inbox
 * drains. Replaces the /invite route's 3-second component-lifetime poll
 * (FM3) and gives the group channel its missing requester-side contact
 * write (FM4). Subscribes via its own useAccount (App.tsx's resolve stays
 * shallow by convention — see the comment above App's useAccount).
 *
 * The contact write pins entry.counterpartFingerprint as snapshotted at
 * send time by sendConnectionRequest — for the group channel that snapshot
 * comes from getForeignAccountPubkeyHex (target-derived; see the 2026-07-21
 * C1 amendment). The watcher never re-derives fingerprints itself.
 *
 * Transitions are idempotent: computeOutgoingAction returns "none" once the
 * status/archivedAt writes land, so the render-reactive effect settles.
 */
export function useOutgoingRequestWatcher(): void {
  // $onError: "catch" at $each levels: one unavailable/unauthorized child
  // CoValue must not stall me.$isLoaded for ALL entries. The precedent is
  // use-home-lists.ts knownConversations resolve (same syntax). Caught entries
  // resolve to null — existing null guards in both effects cover this shape:
  // effect 1 checks `!entry || typeof entry.$jazz?.set !== "function"`;
  // effect 2 checks `!entry || entry.archivedAt` + `!req?.$jazz?.id`.
  const me = useAccount(ArcanAccount, {
    resolve: {
      root: {
        contacts: { $each: { $onError: "catch" } },
        outgoingRequests: { $each: { request: true, $onError: "catch" } },
        incomingConnectionRequests: { $each: { $onError: "catch" } },
        dismissedRequests: true,
        pendingPairings: { $each: { $onError: "catch" } },
        liveInvitations: { $each: { $onError: "catch" } },
        pendingNotifications: { $each: { $onError: "catch" } },
      },
    },
  });
  const retriedThisLaunch = useRef(false);

  // 1. Reactive transitions (approve/deny/expire) — runs on every render of
  // the resolved graph; cheap and settles to no-ops.
  useEffect(() => {
    if (!me.$isLoaded) return;
    const outgoing = (me as any).root?.outgoingRequests;
    if (!outgoing) return;
    const nowMs = Date.now();
    for (const entry of Object.values(outgoing as Record<string, any>)) {
      if (!entry || typeof entry.$jazz?.set !== "function") continue;
      const req = entry.request;
      const action = computeOutgoingAction(
        {
          status: entry.status,
          archivedAtMs: entry.archivedAt
            ? new Date(entry.archivedAt).getTime()
            : undefined,
          approvedAtMs: req?.approvedAt
            ? new Date(req.approvedAt).getTime()
            : undefined,
          deniedAtMs: req?.deniedAt
            ? new Date(req.deniedAt).getTime()
            : undefined,
          expiresAtMs: req?.expiresAt
            ? new Date(req.expiresAt).getTime()
            : undefined,
        },
        nowMs,
      );
      if (action === "none") continue;
      if (action === "approve") {
        const upsertResult = upsertContact(me as any, {
          contactAccountID: entry.counterpartAccountID,
          fingerprint: entry.counterpartFingerprint,
          displayName: entry.counterpartDisplayName,
        });
        // resolveApproveOutcome encodes the sanctioned DEVIATION from the plan
        // snippet (which archived unconditionally): "unavailable" → retry so we
        // never archive an approval whose contact write didn't happen (FM3 loss).
        // created/unchanged/conflict → archive (contact is durably recorded).
        if (resolveApproveOutcome(upsertResult) === "retry") continue;
        entry.$jazz.set("status", "approved");
      } else if (action === "deny") {
        entry.$jazz.set("status", "denied");
      } else {
        entry.$jazz.set("status", "expired");
      }
      entry.$jazz.set("archivedAt", new Date());
    }
  });

  // 2. Failed-send retry — once per launch + on browser reconnect (spec §2).
  useEffect(() => {
    if (!me.$isLoaded) return;

    const retryFailed = () => {
      const outgoing = (me as any).root?.outgoingRequests;
      if (!outgoing) return;
      for (const entry of Object.values(outgoing as Record<string, any>)) {
        if (!entry || entry.archivedAt) continue;
        const undelivered =
          entry.status === "failed" ||
          (entry.status === "pending" && !entry.deliveredAt);
        if (!undelivered) continue;
        const req = entry.request;
        if (!req?.$jazz?.id) continue;
        const expMs = req.expiresAt
          ? new Date(req.expiresAt).getTime()
          : Number.POSITIVE_INFINITY;
        if (expMs <= Date.now()) continue; // expiry transition handles it
        void (async () => {
          try {
            await withTimeout(
              deliverConnectionRequest(
                me as any,
                entry.counterpartAccountID,
                req,
              ),
              REQUEST_ACK_TIMEOUT_MS,
            );
            // Re-check archivedAt after the await: effect 1 may have archived
            // this entry (approval landed mid-flight). Writing status "pending"
            // over a terminal status would clobber the label — skip it.
            // deliveredAt is still safe to write (informational; doesn't affect
            // the state machine).
            entry.$jazz.set("deliveredAt", new Date());
            if (!entry.archivedAt) {
              entry.$jazz.set("status", "pending");
            }
          } catch (e) {
            console.warn("[handshake] retry delivery failed:", e);
            entry.$jazz.set("status", "failed");
          }
        })();
      }
    };

    if (!retriedThisLaunch.current) {
      retriedThisLaunch.current = true;
      retryFailed();
      pruneHandshakeState(me);
    }
    window.addEventListener("online", retryFailed);
    return () => window.removeEventListener("online", retryFailed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.$isLoaded]);
}
