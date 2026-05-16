import { co, z } from "jazz-tools";

/**
 * Contact: a single contact entry in the user's contact book.
 *
 * Note: `linkedConversation` is deferred to Slice 3 to avoid circular
 * imports between Contact and Conversation.
 *
 * Deviation from plan: uses co.map() / z.* functional API instead of
 * `class Contact extends CoMap`.
 */
export const Contact = co.map({
  contactAccountID: z.string(),
  pinnedFingerprint: z.string(),
  displayNameLocal: z.string(),
  addedAt: z.date(),
  notes: z.string().optional(),
});

/**
 * ContactBook: ordered list of Contact entries.
 *
 * Deviation from plan: uses co.list(Contact) instead of
 * `class ContactBook extends CoList.of(co.ref(Contact))`.
 */
export const ContactBook = co.list(Contact);
