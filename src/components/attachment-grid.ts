/**
 * Aspect-ratio math for the multi-image grid + single-image placeholder
 * (feedback round 5). Pure and unit-tested. "Aspect" is width/height.
 *
 * Cells clamp to a near-square band so portrait sets get visibly taller
 * bubbles while one extreme panorama can't blow the layout up. If ANY visible
 * image lacks stored dimensions, the grid falls back to today's fixed squares
 * (gridUnitAspect → null), so legacy messages are unchanged.
 */
export const CELL_MIN = 3 / 4; // 0.75 — tallest allowed cell
export const CELL_MAX = 4 / 3; // 1.333 — widest allowed square-ish cell
export const HERO_MIN = 1.5;
export const HERO_MAX = 2.5;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** w/h for an attachment with stored dims, else null. */
export function imageAspect(att: any): number | null {
  const w = att?.width;
  const h = att?.height;
  if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
    return w / h;
  }
  return null;
}

/**
 * One shared aspect for the grid's square-ish cells: mean of members' clamped
 * aspects, clamped again. null when any member lacks dims (→ fixed squares).
 */
export function gridUnitAspect(aspects: (number | null)[]): number | null {
  if (aspects.length === 0) return null;
  if (aspects.some((a) => a == null)) return null;
  const clamped = (aspects as number[]).map((a) => clamp(a, CELL_MIN, CELL_MAX));
  const mean = clamped.reduce((s, v) => s + v, 0) / clamped.length;
  return clamp(mean, CELL_MIN, CELL_MAX);
}

/** Full-width hero cell (spans 2 columns): ~2× the unit, clamped wide. */
export function heroAspect(unit: number): number {
  return clamp(unit * 2, HERO_MIN, HERO_MAX);
}
