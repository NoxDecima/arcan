import { co, z } from "jazz-tools";
import { Message } from "./Message";

/**
 * Conversation: a 1:1 or group chat thread.
 *
 * Author derivation does NOT use a registry — see §6.2 of the Slice 3a design spec.
 * Author is read from each message's create-transaction signer, validated against
 * the well-formedness of the owning WriteGroup. The previous authorWriteGroups
 * field was removed in Slice 3a because it enabled a registry-poisoning
 * impersonation attack (any conversation writer could overwrite the mapping for
 * any participant).
 */
export const Conversation = co.map({
  title: z.string().optional(),
  kind: z.enum(["dm", "group"]),
  createdAt: z.date(),
  createdBy: z.string(),
  messages: co.list(Message),
});
