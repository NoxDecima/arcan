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
 */
export function upsertContact(
  me: Account,
  data: ContactData,
): UpsertContactResult {
  const contacts = (me as any).root?.contacts;
  if (!contacts || typeof contacts.$jazz?.set !== "function") {
    return "unavailable";
  }

  const existing = contacts[data.contactAccountID];
  if (existing) {
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
