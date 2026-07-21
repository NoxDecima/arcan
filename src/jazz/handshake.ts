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
import { Account } from "jazz-tools";
import { Contact } from "./schema/Contact";
import {
  mintConnectionRequest,
  deliverConnectionRequest,
  GROUP_REQUEST_TTL_MS,
} from "./invitations";
import { OutgoingConnectionRequest } from "./schema/OutgoingConnectionRequest";

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

/** App-side ack timeout — Inbox sendMessage has NONE upstream (canon §2a). */
export const REQUEST_ACK_TIMEOUT_MS = 15_000;
/** Request expiry floor: 7 days from send, decoupled from invitation TTL (FM9). */
export const REQUEST_MIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
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
