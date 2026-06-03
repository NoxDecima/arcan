import { useEffect, useRef } from "react";

/**
 * Diff tracker that detects per-conversation UNREAD-count increases and
 * fires a callback for each new arrival worth notifying about.
 *
 * Semantic: fires when unread > prev_unread for a given conversation.
 * "Unread grew" captures "a new message I haven't read arrived from
 * someone else" precisely:
 *   - Self-sent messages bump messageCount but NOT unread (getUnreadCount
 *     excludes own messages) → no fire. This matters when the same
 *     account has multiple tabs open: sending in tab A must not trigger
 *     a notification sound in tab B.
 *   - Opening the conversation runs markRead → cutoff advances → unread
 *     drops → no fire (the unread > prev_unread guard).
 *   - A new foreign message arrives → unread grows → fire.
 *
 * Design notes
 * ------------
 * The diff happens inside useEffect, NOT in the render body. This matters
 * because:
 *   - React StrictMode invokes render twice in dev; doing the diff in
 *     render would either double-fire (mutating prev counts in render)
 *     or miss events (one of the two render-passes already advanced
 *     the snapshot before the other one ran).
 *   - useEffect runs once per committed render, regardless of how many
 *     times render was called.
 *
 * A conversation is considered "new" on its first observation — we have
 * no baseline to compare against, so we don't fire. Only subsequent
 * unread growth triggers the callback.
 *
 * The `messageCount` field is kept in the input shape for callers that
 * also want it elsewhere (e.g. for the tab-title aggregate), but the
 * trigger logic uses `unread` only.
 */
export function useNewMessageEvents(args: {
  conversations: Array<{
    id: string;
    label: string;
    messageCount: number;
    unread: number;
  }>;
  onNewMessage: (event: {
    conversationID: string;
    conversationLabel: string;
  }) => void;
}): void {
  const prevUnread = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    for (const c of args.conversations) {
      const prev = prevUnread.current.get(c.id);
      if (prev !== undefined && c.unread > prev) {
        args.onNewMessage({
          conversationID: c.id,
          conversationLabel: c.label,
        });
      }
      prevUnread.current.set(c.id, c.unread);
    }
  });
}
