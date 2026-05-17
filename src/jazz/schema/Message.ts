import { co, z } from "jazz-tools";
import { FileBlob } from "./FileBlob";

/**
 * Message: a single message in a conversation.
 *
 * Authorship is structural (the message's create-transaction signer) — NOT a
 * self-declared field. See §6.2 of the Slice 3a design spec.
 *
 * Edit semantics: body is overwritten in place; `edited` flag set; `editedAt`
 * records the most recent edit time. Edit history (previous versions) is not
 * surfaced.
 *
 * Delete semantics: body is cleared (set to empty string); `deleted` flag set.
 * Body is no longer trusted; the renderer shows a "This message was deleted"
 * placeholder. Transaction-log retention is a documented threat-model property.
 */
export const Message = co.map({
  sentAt: z.date(),
  body: z.string(),
  attachments: co.list(FileBlob),
  edited: z.boolean().optional(),
  editedAt: z.date().optional(),       // NEW
  deleted: z.boolean().optional(),     // NEW
  get replyTo() {
    return Message.optional();
  },
});
