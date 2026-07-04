// src/ui/kit/pbutton.tsx — port of design/proto-ui.jsx lines 87–99.
// Interactive button with four variants (primary/danger/ghost/outline).
// Color and typography exclusively via mapping-table tokens.
// Icon inherits variant text color via currentColor.
//
import { Icon, type IconName } from "./icon";
import { tapClass } from "./tap";

export function PButton({
  label,
  icon,
  primary,
  danger,
  ghost,
  full,
  onClick,
  className,
  "data-testid": testId,
}: {
  label: string;
  icon?: IconName;
  primary?: boolean;
  danger?: boolean;
  ghost?: boolean;
  full?: boolean;
  onClick?: () => void;
  className?: string;
  "data-testid"?: string;
}): JSX.Element {
  let variantClass: string;
  if (primary) {
    // proto has `border: 1px solid transparent` — keeps all variants' box
    // geometry identical when stacked next to bordered siblings
    variantClass = "bg-arcan-accent-fill text-on-accent border border-transparent";
  } else if (danger) {
    variantClass = "bg-transparent text-red border border-red-border";
  } else if (ghost) {
    variantClass = "bg-transparent text-text-2";
  } else {
    // default: outline
    variantClass = "bg-transparent text-text border border-hairline";
  }

  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={[
        tapClass,
        // PButton structure (mapping table)
        "h-11 rounded-pill font-mono font-semibold text-ui-btn",
        "justify-center gap-2",
        full ? "w-full" : "px-[18px]",
        variantClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon && <Icon d={icon} size={16} fill={icon === "send"} />}
      {label}
    </button>
  );
}
