import { useId } from "react";

export type LatticeTier = "full" | "reduced" | "minimal" | "glyph";

export function latticeTier(size: number): LatticeTier {
  if (size >= 44) return "full";
  if (size >= 26) return "reduced";
  if (size >= 18) return "minimal";
  return "glyph";
}

/* ---- low-level SVG primitives ---- */

function pc(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
}
const f = (n: number) => n.toFixed(2);

function ring(r: number, sw: number, p: string): string {
  return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${p}" stroke-width="${sw}" />`;
}

function ticks(r: number, count: number, len: number, sw: number, p: string): string {
  let s = "";
  for (let i = 0; i < count; i++) {
    const deg = (i * 360) / count;
    const [x1, y1] = pc(r, deg);
    const [x2, y2] = pc(r - len, deg);
    s += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${p}" stroke-width="${sw}" stroke-linecap="butt" />`;
  }
  return s;
}

function hexPoly(R: number, fillP: string | null, strokeP: string | null, sw = 2): string {
  const pts = [0, 60, 120, 180, 240, 300].map((d) => pc(R, d).map(f).join(",")).join(" ");
  const stroke = strokeP ? `stroke="${strokeP}" stroke-width="${sw}" stroke-linejoin="miter"` : "";
  return `<polygon points="${pts}" fill="${fillP || "none"}" ${stroke} />`;
}

function spokes6(r1: number, r2: number, sw: number, p: string): string {
  let s = "";
  for (let k = 0; k < 6; k++) {
    const [x1, y1] = pc(r1, k * 60);
    const [x2, y2] = pc(r2, k * 60);
    s += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${p}" stroke-width="${sw}" stroke-linecap="round" />`;
  }
  return s;
}

function tierMarkup(tier: LatticeTier, p: string): string {
  switch (tier) {
    case "full":
      return (
        ring(42, 2.6, p) +
        ticks(42, 24, 5, 1.4, p) +
        spokes6(17, 42, 1.8, p) +
        ring(30, 1.3, p) +
        hexPoly(17, null, p, 2.4) +
        hexPoly(8.5, p, null)
      );
    case "reduced":
      return ring(42, 3, p) + spokes6(18, 42, 2.8, p) + ring(30, 1.6, p) + hexPoly(18, null, p, 3) + hexPoly(9, p, null);
    case "minimal":
      return ring(42, 3.4, p) + spokes6(19, 42, 3, p) + hexPoly(19, null, p, 3.4) + hexPoly(9, p, null);
    case "glyph":
      return ring(42, 5, p) + spokes6(14, 42, 4.5, p) + hexPoly(20, p, null);
  }
}

/* ---- component ---- */

export interface LatticeProps {
  size?: number;
  mono?: boolean;
  className?: string;
}

export function Lattice({ size = 24, mono = false, className }: LatticeProps) {
  const tier = latticeTier(size);
  const uid = useId().replace(/:/g, "");
  const paint = mono ? "currentColor" : `url(#lattice-grad-${uid})`;
  const inner = tierMarkup(tier, paint);

  const grad = mono
    ? ""
    : `<defs><linearGradient id="lattice-grad-${uid}" gradientUnits="userSpaceOnUse" x1="14" y1="86" x2="86" y2="14">` +
      `<stop offset="0" stop-color="var(--color-accent-grad-0)"/>` +
      `<stop offset="1" stop-color="var(--color-accent-grad-1)"/>` +
      `</linearGradient></defs>`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Arcan"
      className={className}
      style={{ display: "block", flexShrink: 0, overflow: "visible" }}
      dangerouslySetInnerHTML={{ __html: grad + inner }}
    />
  );
}
