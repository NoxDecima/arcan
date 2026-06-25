import { useEffect, type ReactNode, type CSSProperties } from "react";
import { Lattice } from "@/components/lattice";

/**
 * AuthSurface: shared cosmic full-bleed backdrop used by every
 * pre-authenticated auth flow (sign-in, recovery, onboarding steps),
 * QR pairing (initiator + responder), and the polymorphic profile view.
 *
 * Design source: design/hf-flows.jsx, function AuthSurface (lines 12-29).
 *
 * Layout:
 *   - `min-h-screen` flex container, dark by default (`bg-bg`).
 *   - Oversized pale Arcan Lattice watermark bleeding off the bottom-right
 *     corner (opacity 0.05) — uses currentColor so it inherits `text-text`.
 *   - 4 scattered cosmic stars (small absolutely-positioned dots) at
 *     deterministic positions per the design.
 *   - Centered narrow card column for the children (default 320px).
 *
 * Props:
 *   - w           — card column width in px (default 320)
 *   - tall        — when true, aligns column to top and enables vertical
 *                   scroll (for steps with grids that exceed the viewport,
 *                   e.g. backup-display 24-word grid).
 *   - forceDark   — temporarily pins <html data-theme="dark"> while the
 *                   surface is mounted, restoring the previous value on
 *                   unmount. Auth surfaces are dark by design (Headline #1
 *                   in the audit doc).
 *   - children    — the centered card column contents.
 */
export interface AuthSurfaceProps {
  w?: number;
  tall?: boolean;
  forceDark?: boolean;
  children: ReactNode;
}

export function AuthSurface({
  w = 320,
  tall = false,
  forceDark = false,
  children,
}: AuthSurfaceProps) {
  // Force-dark: pin <html data-theme="dark"> while this surface is mounted.
  useEffect(() => {
    if (!forceDark) return;
    const html = document.documentElement;
    const prev = html.getAttribute("data-theme");
    html.setAttribute("data-theme", "dark");
    return () => {
      if (prev === null) html.removeAttribute("data-theme");
      else html.setAttribute("data-theme", prev);
    };
  }, [forceDark]);

  // Both modes vertically center the card column. `tall` allows the page to
  // scroll when the column exceeds the viewport (e.g. the 24-word backup grid);
  // `my-auto` keeps the column centered when it fits and reachable (scroll from
  // top) when it doesn't. Non-tall stays `overflow-hidden` so the watermark can
  // bleed off-edge without spawning scrollbars.
  const rootCls = [
    "min-h-screen w-full relative flex items-center justify-center bg-bg",
    tall ? "overflow-y-auto" : "overflow-hidden",
  ].join(" ");

  const columnStyle: CSSProperties = {
    width: `${w}px`,
    maxWidth: "88%",
    gap: tall ? 11 : 15,
    // Horizontal padding only; vertical breathing room comes from `py-8`
    // (tall) so `my-auto` can do the centering. Non-tall keeps the original
    // uniform 18px inset.
    padding: tall ? "0 18px" : 18,
  };

  return (
    <div className={rootCls} data-auth-surface="">
      {/* Cosmic watermark — oversized pale Arcan Lattice bleeding off
          the bottom-right. Uses `mono` so it inherits text-text via
          currentColor; opacity is tuned for dark theme. */}
      <div
        aria-hidden="true"
        className="absolute pointer-events-none select-none opacity-[0.05] text-text"
        style={{ right: -84, bottom: -96, width: 360, height: 360 }}
      >
        <Lattice size={360} mono />
      </div>

      {/* Four scattered cosmic stars at deterministic positions. */}
      <Star x="22%" y="20%" color="var(--color-accent)" size={4} glow />
      <Star x="72%" y="26%" color="#bb9af7" size={3} glow />
      <Star x="30%" y="74%" color="#7dcfff" size={3} glow />
      <Star x="80%" y="66%" color="var(--color-accent)" size={2} />

      {/* Centered narrow card column. `my-auto` centers it vertically within
          the flex parent and, when `tall`, keeps it fully reachable on
          overflow scroll; `py-8` (tall) supplies the vertical breathing room. */}
      <div
        data-auth-column=""
        className={`relative flex flex-col my-auto${tall ? " py-8" : ""}`}
        style={columnStyle}
      >
        {children}
      </div>
    </div>
  );
}

interface StarProps {
  x: string;
  y: string;
  color: string;
  size: number;
  glow?: boolean;
}

function Star({ x, y, color, size, glow }: StarProps) {
  const style: CSSProperties = {
    position: "absolute",
    left: x,
    top: y,
    width: size,
    height: size,
    borderRadius: size,
    background: color,
    boxShadow: glow ? `0 0 10px ${color}99` : "none",
  };
  return <div data-auth-star="" aria-hidden="true" style={style} />;
}

/**
 * Wordmark: centered Arcan Lattice glyph + "arcan" text — used at the top
 * of every auth/onboarding/pair surface.
 *
 * Design source: design/hf-flows.jsx, function Wordmark (lines 7-9), plus
 * design/hf-kit.jsx#ArcanMark (lines 199-241) for the stacked layout
 * reference (mark above, tracked-uppercase "arcan" beneath).
 */
export interface WordmarkProps {
  size?: number;
}

export function Wordmark({ size = 26 }: WordmarkProps) {
  // Design's Wordmark calls ArcanMark with `size * 2.1` for the glyph.
  // We keep the live <Lattice> at the user-facing `size` since our Lattice
  // already scales correctly via the `size` prop; the design's doubling
  // is a quirk of its inline SVG handling. Visually compare during
  // Phase 5 spot-check and tune if needed.
  const labelFs = Math.round(size * 0.5);
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ gap: Math.round(size * 0.2) }}
    >
      <Lattice size={size} />
      <span
        className="font-mono text-text uppercase"
        style={{
          fontSize: labelFs,
          letterSpacing: "0.5em",
          paddingLeft: "0.5em", // optical centering — the trailing letter-spacing pulls the visual centroid right
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        arcan
      </span>
    </div>
  );
}

/**
 * Steps: progress indicator — row of `of` dashes, with the first `n`
 * filled accent and the rest filled panel-2.
 *
 * Design source: design/hf-flows.jsx, function Steps (lines 31-34).
 */
export interface StepsProps {
  n: number;
  of?: number;
}

export function Steps({ n, of = 4 }: StepsProps) {
  return (
    <div className="flex justify-center gap-[5px] mb-[2px]">
      {Array.from({ length: of }).map((_, i) => (
        <div
          key={i}
          data-auth-step=""
          className={`h-1 w-[22px] rounded-r-1 ${i < n ? "bg-arcan-accent" : "bg-panel-2"}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

/**
 * AuthTitle: centered title text styled per design's `Title` (lines 35-37).
 * 19px / 700 / line-height 1.25 / -.01em tracking when mono.
 */
export function AuthTitle({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-center text-text font-mono font-bold leading-tight"
      style={{ fontSize: 19, letterSpacing: "-0.01em" }}
    >
      {children}
    </div>
  );
}

/**
 * AuthSub: centered subtitle text styled per design's `Sub` (lines 38-40).
 * 11.5px / 400 / line-height 1.5 / negative top margin to tuck under title.
 */
export function AuthSub({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-center text-text-2 -mt-2"
      style={{ fontSize: 11.5, lineHeight: 1.5 }}
    >
      {children}
    </div>
  );
}
