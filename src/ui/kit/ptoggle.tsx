// src/ui/kit/ptoggle.tsx — port of design/proto-ui.jsx lines 100–107.
// Toggle switch with 38×22 pill track and 16px sliding knob.
//
// Border geometry note: the prototype writes `border: 1px solid ${on ? 'transparent' : c.border}`.
// The border is ALWAYS present (1px, just transparent when on). This keeps the
// content-box and padding-box stable across states so the knob's absolute
// top/left offsets don't shift by 1px. Port exactly as `border border-transparent`
// (on) / `border border-hairline` (off) — do NOT use a conditional border-width.

import { tapClass } from "./tap";
import type { JSX } from "react";

export function PToggle({
  on,
  onClick,
  "aria-label": ariaLabel,
}: {
  on: boolean;
  onClick?: () => void;
  "aria-label"?: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      className={[
        tapClass,
        "w-[38px] h-[22px] rounded-pill relative transition-colors duration-switch",
        on
          ? "bg-arcan-accent-fill border border-transparent"
          : "bg-panel-2 border border-hairline",
      ].join(" ")}
    >
      {/* Knob: left is state-driven inline so the value is a number (not a class string). */}
      <span
        className={[
          "absolute top-[2px] w-[16px] h-[16px] rounded-pill transition-[left] duration-switch",
          on ? "bg-on-accent" : "bg-text-2",
        ].join(" ")}
        style={{ left: on ? 18 : 2 }}
      />
    </button>
  );
}
