import { co, z } from "jazz-tools";
import { FileBlob } from "./FileBlob";

/**
 * Message: a single message in a conversation.
 *
 * `replyTo` is a self-referential optional field; the getter pattern is
 * required by jazz-tools to express recursive CoMap schemas (the schema
 * object isn't fully initialised until after the co.map() call completes).
 *
 * `attachments` is a co.list of FileBlob entries embedded directly in
 * the map field (not a top-level CoList schema) so the whole list travels
 * with the message.
 *
 * Deviations from plan:
 * - Uses co.map() / z.* functional API instead of `class Message extends CoMap`.
 * - `co.ref(CoList.of(co.ref(FileBlob)))` becomes `co.list(FileBlob)` inline.
 * - `co.optional.ref(Message)` becomes a getter returning `Message.optional()`.
 */
export const Message = co.map({
  sentAt: z.date(),
  body: z.string(),
  attachments: co.list(FileBlob),
  get replyTo() {
    return Message.optional();
  },
  edited: z.boolean().optional(),
});
