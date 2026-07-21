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
 * Derive a one-line preview for a conversation's most recent message
 * (Unit 9-3, item 3.1-B). Pure — reads only body / deleted / attachments.
 *
 * Fallbacks mirror how message-bubble.tsx renders these states:
 *  - deleted message       → "message deleted"
 *  - attachment-only (no body text) → "photo"
 *  - body present           → trimmed body, internal whitespace collapsed
 *  - no messages            → "" (caller decides what to show)
 *
 * Whitespace is collapsed so a multi-line message renders as a single
 * truncatable preview line.
 */
export function getLastMessagePreview(conversation: any): string {
  const messages = conversation?.messages;
  if (!messages || messages.length === 0) return "";
  const last = messages[messages.length - 1];
  if (!last) return "";
  if (last.deleted) return "message deleted";
  const body = typeof last.body === "string" ? last.body.trim() : "";
  if (body.length > 0) return body.replace(/\s+/g, " ");
  const attachments = last.attachments;
  if (attachments && attachments.length > 0) return "photo";
  return "";
}
