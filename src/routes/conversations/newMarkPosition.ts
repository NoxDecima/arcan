/**
 * Pure helper for the in-conversation "new messages" divider position.
 *
 * Given a list of timeline items (already sorted by sortAt ascending) and
 * the anchor lastReadAt cutoff captured at mount, return the index BEFORE
 * which the divider should render — or -1 to omit it entirely.
 *
 * Rules (Phase 7):
 *   - Only message items qualify (kind === "message").
 *   - Self-authored messages are skipped (no divider for one's own posts).
 *   - SystemEvents are skipped (kind === "event").
 *   - The first qualifying item with sortAt > anchor wins.
 *   - If no item qualifies → -1 (no divider).
 *   - If anchor is 0 or null → the first qualifying item wins, putting the
 *     divider at the top of the timeline when all messages are unread.
 */
export type DividerTimelineItem =
  | {
      kind: "message";
      sortAt: number;
      authorAccountID: string | null;
    }
  | { kind: "event"; sortAt: number };

export function findNewMarkIndex(
  items: DividerTimelineItem[],
  anchor: number | null,
  myAccountID: string | null,
): number {
  const a = anchor ?? 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "message") continue;
    if (item.authorAccountID && item.authorAccountID === myAccountID) continue;
    if (item.sortAt > a) return i;
  }
  return -1;
}
