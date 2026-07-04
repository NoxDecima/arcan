// src/ui/kit/desktop-window.tsx — port of design/proto.jsx:676-691.
// Desktop window chrome: traffic lights + address pill + main content area.
// Traffic light colours are decorative hex constants — not tokenized by design.

import type { ReactNode } from "react";
import { ArcanMark } from "./arcan-mark";
import type { JSX } from "react";

const TRAFFIC = ["#e2696e", "#e6b450", "#5fb87f"] as const;

export function DesktopWindow({
  children,
  narrow,
}: {
  children: ReactNode;
  narrow?: boolean;
}): JSX.Element {
  const w = narrow ? "min(520px, 92vw)" : "min(1200px, 95vw)";
  const h = narrow ? "min(620px, 88vh)" : "min(88vh, 820px)";

  return (
    <div
      className="rounded-r-5 overflow-hidden border border-hairline bg-bg shadow-window flex flex-col"
      style={{ width: w, height: h }}
    >
      {/* title bar */}
      <div className="h-[38px] shrink-0 flex items-center gap-2 px-3.5 border-b border-hairline bg-panel">
        {/* traffic lights — decorative hex constants per mapping table */}
        <div className="flex gap-[7px]">
          {TRAFFIC.map((col) => (
            <span
              key={col}
              style={{
                display: "inline-block",
                width: 11,
                height: 11,
                borderRadius: 999,
                background: col,
                opacity: 0.9,
              }}
            />
          ))}
        </div>
        {/* centered address pill */}
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-[7px] px-3.5 py-1 rounded-pill bg-bg border border-hairline">
            <ArcanMark size={12} mono showWord={false} />
            <span className="font-mono font-medium text-ui-chrome tracking-tab text-dim">
              arcan · local-first
            </span>
          </div>
        </div>
        {/* right spacer — balances traffic lights */}
        <div className="w-[52px]" />
      </div>
      {/* content area */}
      <div className="flex-1 min-h-0 flex">{children}</div>
    </div>
  );
}
