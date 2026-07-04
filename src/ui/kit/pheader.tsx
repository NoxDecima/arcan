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
import type { JSX } from "react";

export function PHeader({
  title,
  sub,
  onBack,
  avatar,
  onAvatar,
  onTitle,
  right,
  rootTestId,
  titleButtonTestId,
  backTestId,
  titleTestId,
}: {
  title: string;
  sub?: ReactNode;
  onBack?: () => void;
  avatar?: ReactNode;
  onAvatar?: () => void;
  onTitle?: () => void;
  right?: ReactNode;
  /** Optional data-testid on the root div. Sanctioned: container testid carry. */
  rootTestId?: string;
  /** Optional data-testid on the onTitle button. Sanctioned: conversation-header-link carry. */
  titleButtonTestId?: string;
  /** Optional data-testid on the back button. Sanctioned: chat-back-arrow carry. */
  backTestId?: string;
  /** Optional data-testid on the title text div. Sanctioned: conversation-title carry. */
  titleTestId?: string;
}): JSX.Element {
  const titleBlock = (
    <div className="flex-1 min-w-0">
      <div
        className="font-mono font-bold text-ui-title tracking-title truncate text-text"
        {...(titleTestId ? { "data-testid": titleTestId } : {})}
      >
        {title}
      </div>
      {sub && (
        <div className="mt-0.5 flex items-center gap-[5px]">{sub}</div>
      )}
    </div>
  );

  return (
    <div
      className="min-h-[52px] shrink-0 flex items-center gap-[11px] px-3 border-b border-hairline bg-bg"
      {...(rootTestId ? { "data-testid": rootTestId } : {})}
    >
      {onBack && (
        <button
          onClick={onBack}
          className={tapClass}
          {...(backTestId ? { "data-testid": backTestId } : {})}
        >
          <Icon d="back" size={20} className="text-text-2" />
        </button>
      )}
      {onTitle ? (
        <button
          onClick={onTitle}
          className={`${tapClass} flex-1 min-w-0 gap-[11px] text-left`}
          {...(titleButtonTestId ? { "data-testid": titleButtonTestId } : {})}
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
