// src/ui/screens/chat-composer.tsx — pure composer bar presenter.
// Node-for-node port of design/proto.jsx:189–200 (ChatScreen composer bar).
// Patched copy: typing state removed; s.soft=true (pill), s.prompt=true (›) hardcoded to v5.
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode } from "react";
import { Icon } from "../kit/icon";
import { tapClass } from "../kit/tap";
import type { JSX } from "react";

export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled,
  onAttach,
  attachSlot,
  errorSlot,
  hasAttachments,
  onPaste,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  /** "message ada" / "message group" (proto:194) */
  placeholder: string;
  /** Rung 4: renders dimmed, input disabled. */
  disabled?: boolean;
  /** Triggers container's file input. */
  onAttach?: () => void;
  /** Rung 4: pending-attachment chips row above the bar. */
  attachSlot?: ReactNode;
  /** Rung 4: composer-error line. */
  errorSlot?: ReactNode;
  /** Rung 4: true when pending attachments are present — enables send even with empty text. */
  hasAttachments?: boolean;
  /** Rung 4: paste handler for clipboard-image ingestion. */
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}): JSX.Element {
  const armed = (Boolean(value.trim()) || (hasAttachments ?? false)) && !disabled;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onSend();
  };

  return (
    <div className={disabled ? "opacity-50" : undefined}>
      {/* Rung 4: attachment chips slot */}
      {attachSlot}
      {/* Rung 4: error slot */}
      {errorSlot}
      {/* Composer bar cluster — proto:189 */}
      <div className="shrink-0 border-t border-hairline p-2.5 flex items-center gap-[9px] bg-bg">
        {/* Attach button — proto:190, v5 soft → plusc 22 */}
        <button
          className={tapClass}
          onClick={onAttach}
          disabled={disabled}
          data-testid="composer-attach-btn"
          aria-label="attach file"
        >
          <Icon d="plusc" size={22} className="text-text-2" />
        </button>

        {/* Input pill — proto:191; min-w-0 + overflow-hidden allow flex-1 to resolve to exactly 202px */}
        <div className="min-w-0 overflow-hidden flex-1 h-[38px] rounded-pill border border-hairline bg-bg flex items-center gap-2 px-3">
          {/* Prompt › — v5 s.prompt=true; proto:192 */}
          <span className="font-mono font-semibold text-ui-btn text-arcan-accent">
            ›
          </span>
          {/* Input — proto:193–195 */}
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
            placeholder={placeholder}
            disabled={disabled}
            data-testid="composer-input"
            className="flex-1 border-none outline-none bg-transparent font-body text-ui-row leading-none text-text"
            style={{ caretColor: "var(--color-accent-fill)" }}
          />
        </div>

        {/* Send button — proto:197–199 */}
        <button
          onClick={onSend}
          disabled={!armed}
          data-testid="composer-send-btn"
          className={[
            tapClass,
            "w-[38px] h-[38px] rounded-pill justify-center transition-colors duration-[150ms]",
            armed ? "bg-arcan-accent-fill" : "bg-panel-2",
          ].join(" ")}
          aria-label="send"
        >
          <Icon
            d="send"
            size={16}
            fill
            className={armed ? "text-on-accent" : "text-dim"}
          />
        </button>
      </div>
    </div>
  );
}
