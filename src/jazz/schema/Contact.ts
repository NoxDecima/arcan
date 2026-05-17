import { co, z } from "jazz-tools";
import { Conversation } from "./Conversation";

/**
 * Contact: a single contact entry in the user's contact book.
 *
 * `linkedConversation` is an optional reference to the shared DM conversation
 * between the local user and this contact. It is populated by Slice 3 when
 * the user initiates their first message; Slice 2 leaves it null.
 *
 * The getter pattern is required to avoid the circular-import problem:
 * Contact → Conversation → (no back-reference). If Conversation ever imports
 * Contact in a future slice, switch to `linkedConversationID: z.string().optional()`.
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
  get linkedConversation() {
    return Conversation.optional();
  },
});

/**
 * ContactBook: ordered list of Contact entries.
 *
 * Deviation from plan: uses co.list(Contact) instead of
 * `class ContactBook extends CoList.of(co.ref(Contact))`.
 */
export const ContactBook = co.list(Contact);
