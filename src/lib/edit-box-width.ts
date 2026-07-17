/**
 * Width of the inline message-edit container. The historical fixed 220px
 * overflowed the 190px mobile bubble (feedback round 4); cap it to the
 * bubble's max width minus its horizontal padding.
 */
export function editBoxWidth(bubbleWidth: number): number {
  return Math.min(220, bubbleWidth - 24);
}
