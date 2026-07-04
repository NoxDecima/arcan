// src/ui/kit/pbutton.tsx — port of design/proto-ui.jsx lines 87–99.
// Interactive button with four variants (primary/danger/ghost/outline).
// Color and typography exclusively via mapping-table tokens.
// Icon inherits variant text color via currentColor.
//
// Note on tapClass: tapClass (tap.ts) includes `border-none` and `bg-transparent`
// which conflict with bordered/filled variants via Tailwind CSS cascade order.
// PButton builds its own interactive reset, omitting those two:
//   • Tailwind preflight already sets border-style:solid / border-width:0 on all
//     elements, so `border-none` is not needed to reset button UA styles.
//   • Preflight also sets background-color:transparent on button elements, so
//     `bg-transparent` in the base would fight accent-fill and win unpredictably.
// tapClass remains the shared utility for simple icon/tab buttons (no bg/border).

import { Icon, type IconName } from "./icon";

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
    variantClass = "bg-arcan-accent-fill text-on-accent";
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
        // Interactive reset — same intent as tapClass minus bg-transparent/border-none
        // (preflight provides those defaults; omitting avoids cascade conflict with variants)
        "p-0 m-0 cursor-pointer flex items-center [-webkit-tap-highlight-color:transparent]",
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
