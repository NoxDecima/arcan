import { co, z } from "jazz-tools";
import { Message } from "./Message";
import { SystemEvent } from "./SystemEvent";

/**
 * Conversation: a chat thread with one or more participants.
 *
 * Slice 3c removed the `kind` discriminator — a conversation's identity is
 * defined by its member set, not by a stored type field. Two-person
 * conversations and groups share the same shape.
 *
 * Slice 4 added the `systemEvents` sidecar log — see §1 of the Slice 4 design.
 * Membership-change events (added / removed / left / promoted) are written
 * here by the actor performing the action. Render order is sorted by
 * occurredAt + message sentAt, giving the timeline a chronological view of
 * what happened in the conversation.
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
  systemEvents: co.list(SystemEvent),
});
