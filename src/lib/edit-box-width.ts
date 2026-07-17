/**
 * Width of the inline message-edit container. The historical fixed 220px
 * overflowed the 190px mobile bubble (feedback round 4); cap it to the
 * bubble's max width minus its horizontal padding.
 */
export function editBoxWidth(bubbleWidth: number): number {
  // 24 = bubble px-[11px] ×2 + 1px border ×2 — keep in sync with the
  // non-attachment bubble chrome in src/ui/kit/bubble.tsx.
  return Math.min(220, bubbleWidth - 24);
}
