// src/ui/kit/fab.tsx — port of design/proto.jsx:145–152.
// v5 skin: soft=true → rounded-pill; ownStyle=tint (≠ grad) → bg-arcan-accent-fill.
// `size` / `iconSize` props added for Wave A: proto's DesktopApp NavColumn uses
// size={50} iconSize={23} (proto.jsx:777-779). Defaults 52/24 match the existing
// mobile Fab and must render exactly as before.

import { Icon } from "./icon";
import { tapClass } from "./tap";
import type { JSX } from "react";

export function Fab({
  onClick,
  "aria-label": ariaLabel,
  "data-testid": testId,
  size = 52,
  iconSize = 24,
}: {
  onClick?: () => void;
  "aria-label"?: string;
  "data-testid"?: string;
  size?: number;
  iconSize?: number;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`${tapClass} absolute right-4 bottom-4 rounded-pill bg-arcan-accent-fill justify-center shadow-fab z-[4]`}
      style={{ width: size, height: size }}
    >
      <Icon d="plus" size={iconSize} sw={2.2} className="text-on-accent" />
    </button>
  );
}
