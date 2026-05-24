import { co, z } from "jazz-tools";
import { Message } from "./Message";

/**
 * Conversation: a chat thread with one or more participants.
 *
 * Slice 3c removed the `kind` discriminator — a conversation's identity is
 * defined by its member set, not by a stored type field. Two-person
 * conversations and groups share the same shape.
 *
 * Author derivation does NOT use a registry — see §6.2 of the Slice 3a design.
 * Author is read from each message's create-transaction signer, validated
 * against the well-formedness of the owning WriteGroup.
 */
export const Conversation = co.map({
  title: z.string().optional(),
  createdAt: z.date(),
  createdBy: z.string(),
  messages: co.list(Message),
});
