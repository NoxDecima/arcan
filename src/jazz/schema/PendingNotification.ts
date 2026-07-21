import { co, z } from "jazz-tools";
import { Conversation } from "./Conversation";

/**
 * PendingNotification: durable retry state for an outbound conversation /
 * member-add inbox notification (contact-robustness slice, §4). Lives in
 * me.root.pendingNotifications, a co.record keyed by
 * `${conversationID}:${targetAccountID}` — an entry exists only while the
 * notification is unacked; it is deleted from the record on ack.
 */
export const PendingNotification = co.map({
  conversation: Conversation,
  targetAccountID: z.string(),
  kind: z.enum(["conversation", "member-add"]),
  createdAt: z.date(),
  attempts: z.number(),
  lastAttemptAt: z.date().optional(),
});
