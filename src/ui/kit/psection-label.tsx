// src/ui/kit/psection-label.tsx — port of design/proto-ui.jsx lines 68–71.
// Section header label rendered above a PCard.
// v5 skin: sysComment=true → literal "// " prefix; headMono=true → font-mono.
// Wrapper padding: pt-0.5 px-1 pb-2 (= 2px 4px 8px, proto verbatim).
//
// Strut note: the outer div contains an inline span, so the browser creates an
// implicit line box whose height = max(strut, span). The proto gallery inherits
// browser-default font-size (16px) and line-height (normal ≈ 1.125 for Inter at 16px),
// giving a strut of ~19px. The app body carries font-size: 15px and
// line-height: 1.6, raising the strut to 24px and making the div 5px taller.
// Fix: inline-style the outer div to the same context the proto sees so both
// render identically. The span's own text-ui-caps (9px/1) is unaffected.

import type { ReactNode } from "react";
import type { JSX } from "react";

export function PSectionLabel({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="pt-0.5 px-1 pb-2" style={{ fontSize: 16, lineHeight: "1.125" }}>
      <span className="font-mono font-semibold text-ui-caps tracking-caps uppercase text-dim">
        {"// "}
        {children}
      </span>
    </div>
  );
}
