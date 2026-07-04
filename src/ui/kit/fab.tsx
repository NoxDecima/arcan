// src/ui/kit/fab.tsx — port of design/proto.jsx:145–152.
// v5 skin: soft=true → rounded-pill; ownStyle=tint (≠ grad) → bg-arcan-accent-fill.

import { Icon } from "./icon";
import { tapClass } from "./tap";

export function Fab({
  onClick,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: {
  onClick?: () => void;
  "aria-label"?: string;
  "data-testid"?: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`${tapClass} absolute right-4 bottom-4 w-[52px] h-[52px] rounded-pill bg-arcan-accent-fill justify-center shadow-fab z-[4]`}
    >
      <Icon d="plus" size={24} sw={2.2} className="text-on-accent" />
    </button>
  );
}
