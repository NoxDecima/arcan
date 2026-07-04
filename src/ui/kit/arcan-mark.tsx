// src/ui/kit/arcan-mark.tsx — port of design/hf-kit.jsx:195–241.
// Geometry imported from lattice-paths.ts (no window.LATTICE polling).
// Accent gradient via CSS tokens; mono → currentColor (caller supplies color via className).

import { useId } from "react";
import { latticePaths } from "./lattice-paths";

export function ArcanMark({
  size = 24,
  showWord = true,
  mono = false,
  stacked = false,
  className,
}: {
  size?: number;
  showWord?: boolean;
  mono?: boolean;
  stacked?: boolean;
  className?: string;
}): JSX.Element {
  const rawId = useId();
  const uid = rawId.replace(/:/g, "");
  const tier = size >= 44 ? "full" : size >= 26 ? "reduced" : size >= 18 ? "minimal" : "glyph";
  const paint = mono ? "currentColor" : `url(#${uid})`;
  const inner = latticePaths[tier](paint);

  const gradDefs = mono
    ? ""
    : `<defs><linearGradient id="${uid}" gradientUnits="userSpaceOnUse" x1="14" y1="86" x2="86" y2="14">` +
      `<stop offset="0" stop-color="var(--color-accent-grad-0)"/><stop offset="1" stop-color="var(--color-accent-grad-1)"/></linearGradient></defs>`;

  const markup = gradDefs + inner;

  const glyph = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Arcan"
      style={{ display: "block", flexShrink: 0, overflow: "visible" }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );

  if (stacked) {
    const fs = Math.round(size * 0.26);
    return (
      <div
        className={className}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(size * 0.2) }}
      >
        {glyph}
        {showWord && (
          <span
            className="text-text"
            style={{ font: `500 ${fs}px/1 var(--font-mono)`, letterSpacing: "0.5em", textTransform: "uppercase", paddingLeft: "0.5em" }}
          >
            arcan
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.46) }}
    >
      {glyph}
      {showWord && (
        <span
          className="text-text"
          style={{ font: `500 ${Math.round(size * 0.74)}px/1 var(--font-mono)`, letterSpacing: "-.01em" }}
        >
          arcan
        </span>
      )}
    </div>
  );
}
