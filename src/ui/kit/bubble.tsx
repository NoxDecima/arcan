// src/ui/kit/bubble.tsx — port of design/proto.jsx lines 33–71.
// ownPaintP + Bubble + Row (exported as MessageRow). NO TypingRow.
// v5 skin resolves: ownStyle=tint, fam=noir, bubbleRadius=14, soft=true.
// Styling is token-only; no inline paint values.

import type { ReactNode } from "react";
import { HAv } from "./hav";
import { Icon } from "./icon";
import { tapClass } from "./tap";
import type { JSX } from "react";

export interface BubbleMsg {
  who: "me" | "them" | "sys" | "new";
  text?: string;
  name?: string;
  ini?: string;
  /** Avatar image URL for the "them" bubble — optional; falls back to initials. */
  src?: string;
  time?: string;
  att?: boolean;
  /** Rung 4: message was edited — renders "(edited)" indicator below the body row. */
  edited?: boolean;
}

// v5 own paint: tint → bg-bubble-own / border-accent-border / text text-text / time text-dim
// v5 theirs:   fam=noir → bg-panel / border-hairline / shadow-bubble / time text-dim
export function Bubble({
  m,
  w,
  attSlot,
  bodyTestId,
  timeTestId,
  bodyOverride,
}: {
  m: BubbleMsg;
  w: number;
  /** Rung 4, real attachments from the container. */
  attSlot?: ReactNode;
  /** Optional testid on the body text span (e.g. "bubble-body"). Sanctioned: ChatScreen presenter. */
  bodyTestId?: string;
  /** Optional testid on the time span (e.g. "bubble-time"). Sanctioned: ChatScreen presenter. */
  timeTestId?: string;
  /** Rung 4: replaces the body text+time row (e.g. inline edit input). Parity unaffected (default undefined). */
  bodyOverride?: ReactNode;
}): JSX.Element {
  const mine = m.who === "me";
  return (
    <div
      className={[
        mine
          ? "bg-bubble-own border border-accent-border text-text"
          : "bg-panel border border-hairline text-text shadow-bubble",
        // bubbleRadius 14 → rounded-r-5 (all corners); tail corner overrides
        "rounded-r-5",
        mine ? "rounded-br-r-1" : "rounded-bl-r-1",
        // attachment variant: p 6 (p-1.5); normal: 8px 11px
        m.att ? "p-1.5" : "px-[11px] py-2",
      ].join(" ")}
      style={{ maxWidth: w }}
    >
      {m.att && (
        // attachment placeholder: width w-12, height 84, radius max(3,14-6)=8
        // When attSlot present: min-h-[84px] auto-growing; else fixed 84px (parity-locked).
        <div
          className={[
            "flex items-center justify-center rounded-[8px] mb-[5px]",
            mine ? "bg-media-veil" : "bg-rail",
            ...(attSlot ? ["min-h-[84px]"] : []),
          ].join(" ")}
          style={{ width: w - 12, ...(attSlot ? {} : { height: 84 }) }}
        >
          {attSlot ?? (
            <Icon
              d="image"
              size={20}
              className={mine ? "text-white/80" : "text-dim"}
            />
          )}
        </div>
      )}
      {bodyOverride ?? (
        <>
          <div className="flex items-end gap-2">
            <span
              className="flex-1 font-body text-ui-bubble"
              {...(bodyTestId ? { "data-testid": bodyTestId } : {})}
            >
              {m.text}
            </span>
            {m.time && (
              <span
                className="font-mono font-medium text-ui-time text-dim shrink-0 mb-px"
                {...(timeTestId ? { "data-testid": timeTestId } : {})}
              >
                {m.time}
              </span>
            )}
          </div>
          {m.edited && (
            <span className="block font-mono text-ui-time text-dim mt-0.5">
              (edited)
            </span>
          )}
        </>
      )}
    </div>
  );
}

// proto's `Row` — sys and new branches live here exactly as in proto.jsx:53–70.
export function MessageRow({
  m,
  w,
  attSlot,
  testId,
  bodyTestId,
  timeTestId,
  bodyOverride,
  endSlot,
  onAvatar,
}: {
  m: BubbleMsg;
  w: number;
  attSlot?: ReactNode;
  /** Optional testid on the row wrapper div (e.g. "message-mine" / "message-other"). Sanctioned: ChatScreen presenter. */
  testId?: string;
  /** Forwarded to Bubble: testid on the body text span. */
  bodyTestId?: string;
  /** Forwarded to Bubble: testid on the time span. */
  timeTestId?: string;
  /** Rung 4: forwarded to Bubble — replaces body text+time (e.g. inline edit). Parity unaffected (default undefined). */
  bodyOverride?: ReactNode;
  /** Rung 4: rendered as the row's last flex child, self-centered — with
   * row-reverse (own messages) it sits visually beside the bubble in the
   * empty gutter (e.g. the edit/delete ⋮ menu). Parity unaffected. */
  endSlot?: ReactNode;
  /** Intent-fix (non-visual, 2026-07-08 walkthrough): tap on the "them"
   * avatar. When set, the HAv is wrapped in a tapClass button — pixel-neutral
   * (preflight zeroes button padding/border). Parity unaffected (default
   * undefined). */
  onAvatar?: () => void;
}): JSX.Element {
  // sys row: alignSelf center (needs flex-col parent in gallery)
  if (m.who === "sys") {
    return (
      <div
        className="self-center font-mono text-ui-sys text-dim text-center py-0.5"
        {...(testId ? { "data-testid": testId } : {})}
      >
        {"// "}
        {m.text}
      </div>
    );
  }
  // new-messages divider
  if (m.who === "new") {
    return (
      <div
        className="flex items-center gap-2.5 my-0.5"
        {...(testId ? { "data-testid": testId } : {})}
      >
        <div className="flex-1 h-px bg-arcan-accent opacity-50" />
        <span className="font-mono font-semibold text-ui-caps tracking-caps uppercase text-arcan-accent">
          new
        </span>
        <div className="flex-1 h-px bg-arcan-accent opacity-50" />
      </div>
    );
  }
  const mine = m.who === "me";
  return (
    <div
      className={`flex gap-2 items-end ${mine ? "flex-row-reverse" : "flex-row"}`}
      {...(testId ? { "data-testid": testId } : {})}
    >
      {!mine &&
        (onAvatar ? (
          <button
            type="button"
            className={`${tapClass} shrink-0`}
            onClick={onAvatar}
            aria-label={`view ${m.name ?? "sender"}'s profile`}
            data-testid="message-avatar-open"
          >
            <HAv txt={m.ini ?? ""} src={m.src} size={28} />
          </button>
        ) : (
          <HAv txt={m.ini ?? ""} src={m.src} size={28} />
        ))}
      <div
        className={`flex flex-col gap-[3px] max-w-[80%] ${
          mine ? "items-end" : "items-start"
        }`}
      >
        {!mine && m.name && (
          <span className="font-mono font-semibold text-ui-tab text-text-2 ml-[3px]">
            {m.name}
          </span>
        )}
        <Bubble m={m} w={w} attSlot={attSlot} bodyTestId={bodyTestId} timeTestId={timeTestId} bodyOverride={bodyOverride} />
      </div>
      {endSlot && <div className="self-center shrink-0">{endSlot}</div>}
    </div>
  );
}
