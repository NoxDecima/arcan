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
