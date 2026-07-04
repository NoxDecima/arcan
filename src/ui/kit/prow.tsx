// src/ui/kit/prow.tsx — port of design/proto-ui.jsx lines 72–86.
// Settings / profile list row: icon + label + optional sub / value / right slot
// + auto trailing chev when onClick and no explicit right/value.
//
// cursor note: tapClass carries cursor-pointer; non-clickable rows need
// cursor-default. Tailwind generates cursor-default before cursor-pointer in the
// stylesheet (alphabetical by key), so a class override can't win. We use
// `style={{ cursor: 'default' }}` instead — matching the prototype's own
// approach (`cursor: onClick ? 'pointer' : 'default'`). Inline style always
// beats utility-layer classes.

import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { tapClass } from "./tap";

export function PRow({
  icon,
  iconClassName,
  label,
  sub,
  value,
  right,
  onClick,
  danger,
  last,
  "data-testid": testId,
}: {
  icon?: IconName;
  iconClassName?: string;
  label: string;
  sub?: string;
  value?: string;
  right?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  last?: boolean;
  "data-testid"?: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      style={!onClick ? { cursor: "default" } : undefined}
      className={[
        tapClass,
        "w-full text-left flex items-center gap-3 px-3.5 py-3",
        !last && "border-b border-hairline",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon && (
        <Icon
          d={icon}
          size={17}
          className={danger ? "text-red" : (iconClassName ?? "text-text-2")}
        />
      )}
      <div className="flex-1 min-w-0">
        <div
          className={[
            "font-body font-medium text-ui-row",
            danger ? "text-red" : "text-text",
          ].join(" ")}
        >
          {label}
        </div>
        {sub && (
          <div className="mt-[3px] font-body text-ui-sub text-dim">{sub}</div>
        )}
      </div>
      {value && (
        <span className="font-mono text-ui-value text-dim">{value}</span>
      )}
      {right}
      {onClick && !right && !value && (
        <Icon d="chev" size={15} className="text-dim" />
      )}
    </button>
  );
}
