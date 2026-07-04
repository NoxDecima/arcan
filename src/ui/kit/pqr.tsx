// src/ui/kit/pqr.tsx — port of design/proto-ui.jsx lines 121–130.
// Decorative QR placeholder: 5×5 grid of modules, 16 of 25 filled.
// Grid and outer box scale with `size`; dimensions are inline style (no
// Tailwind fraction classes that would compute differently at various rem bases).
//
// Filled module indexes: [0,1,4,5,6,8,12,16,18,19,20,23,24,3,10,14]
// (verbatim from proto — not semantic, just a recognisable QR-like silhouette).

import type { JSX } from "react";
const FILLED = new Set([0, 1, 4, 5, 6, 8, 12, 16, 18, 19, 20, 23, 24, 3, 10, 14]);

export function PQR({ size = 128 }: { size?: number }): JSX.Element {
  const gridSize = size * 0.62;
  return (
    <div
      className="rounded-r-4 border border-hairline bg-bg flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div
        className="grid grid-cols-5 gap-[3px]"
        style={{ width: gridSize, height: gridSize }}
      >
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            className={[
              "rounded-[1px]",
              FILLED.has(i) ? "bg-text" : "bg-transparent",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}
