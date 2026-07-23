import { co, z } from "jazz-tools";

/**
 * Contact: a single contact entry in the user's contact book.
 *
 * Deviation from plan: uses co.map() / z.* functional API instead of
 * `class Contact extends CoMap`.
 *
 * Note: `linkedConversation` was removed in Slice 3b — conversation
 * discovery now uses `me.root.knownConversations` (spec §5). The per-contact
 * ref was a 1:1-only design; knownConversations supports both DM and group.
 */
export const Contact = co.map({
  contactAccountID: z.string(),
  pinnedFingerprint: z.string(),
  displayNameLocal: z.string(),
  addedAt: z.date(),
  notes: z.string().optional(),
  // Contact-robustness slice: set (never cleared automatically) when an
  // upsert or the list→record migration observed a fingerprint that differs
  // from pinnedFingerprint. The OLD pin is always kept (TOFU, threat model
  // §6); the profile safety-number section surfaces "identity key changed —
  // verify". conflictingFingerprint records the most recent differing value.
  fingerprintConflict: z.boolean().optional(),
  conflictingFingerprint: z.string().optional(),
  // linkedConversation REMOVED — discovery now uses
  // me.root.knownConversations (Slice 3b spec §5).
});

/**
 * ContactBook: ordered list of Contact entries.
 *
 * Deviation from plan: uses co.list(Contact) instead of
 * `class ContactBook extends CoList.of(co.ref(Contact))`.
 */
export const ContactBook = co.list(Contact);

/**
 * ContactsRecord: THE contact book (contact-robustness slice) — keyed by the
 * contact's account ID (per-key LWW instead of concurrent-append
 * duplication). Single schema instance shared by ArcanAccountRoot's
 * `contacts` field and the backfill/recovery runners (src/jazz/backfill.ts) —
 * defined HERE, not in ArcanAccount.ts, because backfill.ts may not import
 * ArcanAccount (ArcanAccount's migration imports backfill: a cycle). Schema
 * files import nothing from the jazz modules, so this stays cycle-free.
 */
export const ContactsRecord = co.record(z.string(), Contact);
