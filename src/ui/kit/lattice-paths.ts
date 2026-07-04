// src/ui/kit/lattice-paths.ts — pure TS port of design/lattice.js.
// All geometry helpers are transliterated byte-for-byte; only TypeScript
// type annotations are added. Returns inner SVG markup strings for a
// 0 0 100 100 viewBox. No side-effects, no DOM, no window.LATTICE.

function pc(r: number, deg: number): [number, number] { const a = (deg - 90) * Math.PI / 180; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; }
const f = (n: number) => n.toFixed(2);
function ring(r: number, sw: number, p: string): string { return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${p}" stroke-width="${sw}" />`; }
function ticks(r: number, count: number, len: number, sw: number, p: string, opt: { offset?: number; every?: number; longLen?: number; cap?: string } = {}): string {
  let s = '';
  for (let i = 0; i < count; i++) {
    const deg = i * 360 / count + (opt.offset || 0);
    const L = opt.every && i % opt.every === 0 ? (opt.longLen || len) : len;
    const [x1, y1] = pc(r, deg), [x2, y2] = pc(r - L, deg);
    s += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${p}" stroke-width="${sw}" stroke-linecap="${opt.cap || 'butt'}" />`;
  }
  return s;
}
function dots(r: number, count: number, dr: number, p: string, offset = 0): string {
  let s = '';
  for (let i = 0; i < count; i++) { const [x, y] = pc(r, i * 360 / count + offset); s += `<circle cx="${f(x)}" cy="${f(y)}" r="${dr}" fill="${p}" />`; }
  return s;
}
function seg(r1: number, d1: number, r2: number, d2: number, p: string, sw: number, cap = 'butt'): string {
  const [x1, y1] = pc(r1, d1), [x2, y2] = pc(r2, d2);
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${p}" stroke-width="${sw}" stroke-linecap="${cap}" />`;
}
function hexPoly(R: number, fillP: string | null, strokeP?: string | null, sw?: number): string {
  const pts = [0, 60, 120, 180, 240, 300].map((d) => pc(R, d).map(f).join(',')).join(' ');
  return `<polygon points="${pts}" fill="${fillP || 'none'}" ${strokeP ? `stroke="${strokeP}" stroke-width="${sw || 2}" stroke-linejoin="miter"` : ''} />`;
}
function spokes6(r1: number, r2: number, sw: number, p: string): string { let s = ''; for (let k = 0; k < 6; k++) s += seg(r1, k * 60, r2, k * 60, p, sw, 'round'); return s; }

// Suppress unused-variable warnings — dots/seg are part of the public geometry
// surface and are exported below so callers can compose their own markup.
export { dots, seg };

export const latticePaths: {
  full: (paint: string) => string;
  reduced: (paint: string) => string;
  minimal: (paint: string) => string;
  glyph: (paint: string) => string;
} = {
  /* TIER 1 — FULL. The engraved instrument. Use ≥ 48px (hero, marketing, splash). */
  full: (p) => `
    ${ring(42, 2.6, p)}${ticks(42, 24, 5, 1.4, p)}
    ${spokes6(17, 42, 1.8, p)}
    ${ring(30, 1.3, p)}
    ${hexPoly(17, null, p, 2.4)}
    ${hexPoly(8.5, p)}`,

  /* TIER 2 — REDUCED. Fine ticks dropped; inner ring kept; strokes thicken. ~30–56px. */
  reduced: (p) => `
    ${ring(42, 3, p)}
    ${spokes6(18, 42, 2.8, p)}
    ${ring(30, 1.6, p)}
    ${hexPoly(18, null, p, 3)}
    ${hexPoly(9, p)}`,

  /* TIER 3 — MINIMAL. Outer ring + spokes + nested hex. Inner ring dropped. ~18–28px. */
  minimal: (p) => `
    ${ring(42, 3.4, p)}
    ${spokes6(19, 42, 3, p)}
    ${hexPoly(19, null, p, 3.4)}
    ${hexPoly(9, p)}`,

  /* TIER 4 — GLYPH. Boldest reduction: outer ring + solid gem + six spoke connectors. ≤ 16px.
     Spokes start deep inside the hex so the round cap is buried — clean straight beams from each corner. */
  glyph: (p) => `
    ${ring(42, 5, p)}
    ${spokes6(14, 42, 4.5, p)}
    ${hexPoly(20, p)}`,
};
