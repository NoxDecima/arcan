import { co, z } from "jazz-tools";
import { Message } from "./Message";

/**
 * Conversation: a DM or group chat thread.
 *
 * `messages` holds the ordered message list for the conversation.
 *
 * `authorWriteGroups` maps participant accountID -> WriteGroupID (both
 * strings). The plan called for `CoMap.Record(co.string)` which maps to
 * `co.record(z.string(), z.string())` in 0.20.18.
 *
 * `kind` uses z.enum([...]) to express the "dm" | "group" union.
 *
 * Deviations from plan:
 * - Uses co.map() / z.* functional API instead of `class Conversation extends CoMap`.
 * - `co.literal("dm", "group")` becomes `z.enum(["dm", "group"])`.
 * - `CoMap.Record(co.string)` becomes `co.record(z.string(), z.string())`.
 * - `co.ref(CoList.of(co.ref(Message)))` becomes `co.list(Message)` inline.
 */
export const Conversation = co.map({
  title: z.string().optional(),
  kind: z.enum(["dm", "group"]),
  createdAt: z.date(),
  createdBy: z.string(),
  messages: co.list(Message),
  authorWriteGroups: co.record(z.string(), z.string()),
});
