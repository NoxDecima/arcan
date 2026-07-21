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

/** All contacts, sorted by addedAt (record iteration order is not stable). */
export function listContacts(me: any): any[] {
  const contacts = me?.root?.contacts;
  if (!contacts) return [];
  return Object.values(contacts as Record<string, any>)
    .filter((c: any) => c && typeof c.contactAccountID === "string")
    .sort(
      (a: any, b: any) =>
        new Date(a.addedAt ?? 0).getTime() - new Date(b.addedAt ?? 0).getTime(),
    );
}

/** Keyed lookup. Returns undefined when absent or not loaded. */
export function getContact(me: any, accountID: string): any | undefined {
  const c = me?.root?.contacts?.[accountID];
  return c && typeof c.contactAccountID === "string" ? c : undefined;
}
