// src/ui/kit/body.tsx — port of design/proto-ui.jsx lines 11-14.
// Scrolling body region of a screen.
//
// Strut rule: this is a flex-1 block container — not a block wrapping
// inline-only children with no height constraint — so no fontSize pin applies.

import type { ReactNode } from "react";
import type { JSX } from "react";

export function Body({
  children,
  pad,
  className,
}: {
  children: ReactNode;
  pad?: number | string;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={[
        "flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-bg",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={pad !== undefined ? { padding: pad } : undefined}
    >
      {children}
    </div>
  );
}
