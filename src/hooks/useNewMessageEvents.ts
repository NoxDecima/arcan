import { useEffect, useRef } from "react";

/**
 * Diff tracker that detects per-conversation message-count increases and
 * fires a callback for each new arrival.
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
 * growth triggers the callback.
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
  const prevCounts = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    for (const c of args.conversations) {
      const prev = prevCounts.current.get(c.id);
      if (prev !== undefined && c.messageCount > prev && c.unread > 0) {
        args.onNewMessage({
          conversationID: c.id,
          conversationLabel: c.label,
        });
      }
      prevCounts.current.set(c.id, c.messageCount);
    }
  });
}
