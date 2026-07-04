// src/ui/kit/pheader.tsx — port of design/proto-ui.jsx lines 17-41.
// Screen header: optional back button, title (always mono in v5), optional
// subtitle row, left avatar slot, and right slot.
//
// Strut rule:
//   Root — min-h + flex container, no pin.
//   Title div — block child of flex item, but text-ui-title (16px) is the
//     tallest content and `truncate` prevents multi-line; no pin.
//   Sub div — `mt-0.5 flex items-center gap-[5px]` is a flex container; no pin.

import type { ReactNode } from "react";
import { Icon } from "./icon";
import { tapClass } from "./tap";

export function PHeader({
  title,
  sub,
  onBack,
  avatar,
  onAvatar,
  onTitle,
  right,
}: {
  title: string;
  sub?: ReactNode;
  onBack?: () => void;
  avatar?: ReactNode;
  onAvatar?: () => void;
  onTitle?: () => void;
  right?: ReactNode;
}): JSX.Element {
  const titleBlock = (
    <div className="flex-1 min-w-0">
      <div className="font-mono font-bold text-ui-title tracking-title truncate text-text">
        {title}
      </div>
      {sub && (
        <div className="mt-0.5 flex items-center gap-[5px]">{sub}</div>
      )}
    </div>
  );

  return (
    <div className="min-h-[52px] flex items-center gap-[11px] px-3 border-b border-hairline bg-bg">
      {onBack && (
        <button onClick={onBack} className={tapClass}>
          <Icon d="back" size={20} className="text-text-2" />
        </button>
      )}
      {onTitle ? (
        <button
          onClick={onTitle}
          className={`${tapClass} flex-1 min-w-0 gap-[11px] text-left`}
        >
          {avatar}
          {titleBlock}
        </button>
      ) : (
        <>
          {avatar && (
            <button onClick={onAvatar} className={tapClass}>
              {avatar}
            </button>
          )}
          {titleBlock}
        </>
      )}
      {right}
    </div>
  );
}
