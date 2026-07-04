// src/ui/kit/auth-shell.tsx — port of design/proto.jsx:567-579.
// Auth-surface shell: centered content column over a faded lattice watermark + cosmic dots.

import type { ReactNode } from "react";
import { latticePaths } from "./lattice-paths";

export function AuthShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex-1 min-h-0 relative flex items-center justify-center bg-bg overflow-hidden">
      {/* watermark lattice — opacity from token (dark 0.05 / light 0.06, proto:572) */}
      <svg
        width="320"
        height="320"
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="absolute text-text select-none pointer-events-none"
        style={{ right: -74, bottom: -86, opacity: "var(--opacity-watermark)" }}
        dangerouslySetInnerHTML={{ __html: latticePaths.full("currentColor") }}
      />
      {/* accent dot — 4px accent fill + glow (proto:575) */}
      <div
        className="absolute w-[4px] h-[4px] rounded-pill bg-arcan-accent-fill shadow-dot"
        style={{ left: "22%", top: "20%" }}
      />
      {/* cosmic dot — 3px fixed violet, accent-independent (proto:576) */}
      <div
        className="absolute w-[3px] h-[3px] rounded-pill bg-cosmic-dot"
        style={{ right: "24%", top: "26%" }}
      />
      {/* content column */}
      <div className="w-[280px] max-w-[86%] flex flex-col gap-[13px] relative p-[18px]">
        {children}
      </div>
    </div>
  );
}
