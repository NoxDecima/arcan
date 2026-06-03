import { co, z } from "jazz-tools";
import { getAuthorAccountIDFromMessage } from "@/jazz/messages";

/**
 * Compute the unread message count for a conversation given the user's
 * last-read cutoff. Messages authored by the user are NEVER counted.
 *
 * @param conversation - The conversation (with messages list resolved).
 * @param lastReadAt - Cutoff timestamp (ms epoch). Undefined or missing
 *                    means "never opened" — all foreign messages count.
 * @param myAccountID - The current user's accountID, used to exclude
 *                      messages I sent myself.
 */
export function getUnreadCount(
  conversation: any,
  lastReadAt: number | undefined,
  myAccountID: string,
): number {
  if (!conversation?.messages) return 0;
  const cutoff = lastReadAt ?? 0;
  let count = 0;
  for (const m of conversation.messages) {
    if (!m) continue;
    const sentAt =
      m.sentAt instanceof Date
        ? m.sentAt.getTime()
        : new Date(m.sentAt).getTime();
    // Defensive: a newly-synced message can briefly have BOTH sentAt
    // and $jazz.createdBy as undefined while cojson finishes validating
    // its first transaction. Without the !isFinite guard, new Date(undefined)
    // yields NaN, NaN <= cutoff is false, and the message slips past the
    // cutoff filter. Without the author null guard, undefined !== myID is
    // true and the message also slips past the self check. The two
    // together mis-count an in-flight self-message as foreign unread,
    // which fires a spurious notification on tabs of the same account.
    // See the cross-tab self-send investigation 2026-06-03.
    if (!Number.isFinite(sentAt)) continue;
    if (sentAt <= cutoff) continue;
    const authorID = getAuthorAccountIDFromMessage(m);
    if (authorID == null) continue;
    if (authorID === myAccountID) continue;
    count++;
  }
  return count;
}

/**
 * Mark a conversation as read, advancing the user's lastReadAt cutoff
 * past anything currently visible in the conversation.
 *
 * Clock-skew defense: writes `max(Date.now(), latestSeenMessageSentAt + 1)`.
 * Without the max, a slow local clock could leave items marked unread.
 * Without the latestSeenMessageSentAt + 1 floor, a fast local clock would
 * still mark older messages as read (acceptable behavior actually, but the
 * floor makes the invariant explicit).
 */
export function markRead(me: any, conversationID: string): void {
  if (!me?.root?.$jazz?.set) return;
  const conv = (me.root.knownConversations ?? []).find(
    (c: any) => c?.$jazz?.id === conversationID,
  );
  let latestSentAt = 0;
  if (conv?.messages?.length) {
    for (const m of conv.messages) {
      const t = m?.sentAt;
      const ts = t instanceof Date ? t.getTime() : new Date(t ?? 0).getTime();
      if (ts > latestSentAt) latestSentAt = ts;
    }
  }
  const cutoff = Math.max(Date.now(), latestSentAt + 1);

  // Self-heal: if me.root.lastReadAt is missing (migration race or
  // never-ran), create the record inline with this entry rather than
  // silently no-op'ing. Otherwise the user opens a conversation, sees
  // the badge persist, and concludes the feature is broken.
  if (!me.root.lastReadAt?.$jazz?.set) {
    me.root.$jazz.set(
      "lastReadAt",
      co
        .record(z.string(), z.number())
        .create({ [conversationID]: cutoff }, { owner: me }),
    );
    return;
  }
  me.root.lastReadAt.$jazz.set(conversationID, cutoff);
}
