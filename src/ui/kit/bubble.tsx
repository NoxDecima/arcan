// src/ui/kit/bubble.tsx — port of design/proto.jsx lines 33–71.
// ownPaintP + Bubble + Row (exported as MessageRow). NO TypingRow.
// v5 skin resolves: ownStyle=tint, fam=noir, bubbleRadius=14, soft=true.
// Styling is token-only; no inline paint values.

import { HAv } from "./hav";
import { Icon } from "./icon";

export interface BubbleMsg {
  who: "me" | "them" | "sys" | "new";
  text?: string;
  name?: string;
  ini?: string;
  time?: string;
  att?: boolean;
}

// v5 own paint: tint → bg-bubble-own / border-accent-border / text text-text / time text-dim
// v5 theirs:   fam=noir → bg-panel / border-hairline / shadow-bubble / time text-dim
export function Bubble({ m, w }: { m: BubbleMsg; w: number }): JSX.Element {
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
        <div
          className={[
            "flex items-center justify-center rounded-[8px] mb-[5px]",
            mine ? "bg-media-veil" : "bg-rail",
          ].join(" ")}
          style={{ width: w - 12, height: 84 }}
        >
          <Icon
            d="image"
            size={20}
            className={mine ? "text-white/80" : "text-dim"}
          />
        </div>
      )}
      <div className="flex items-end gap-2">
        <span className="flex-1 font-body text-ui-bubble">{m.text}</span>
        {m.time && (
          <span className="font-mono font-medium text-ui-time text-dim shrink-0 mb-px">
            {m.time}
          </span>
        )}
      </div>
    </div>
  );
}

// proto's `Row` — sys and new branches live here exactly as in proto.jsx:53–70.
export function MessageRow({ m, w }: { m: BubbleMsg; w: number }): JSX.Element {
  // sys row: alignSelf center (needs flex-col parent in gallery)
  if (m.who === "sys") {
    return (
      <div className="self-center font-mono text-ui-sys text-dim text-center py-0.5">
        {"// "}
        {m.text}
      </div>
    );
  }
  // new-messages divider
  if (m.who === "new") {
    return (
      <div className="flex items-center gap-2.5 my-0.5">
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
    >
      {!mine && <HAv txt={m.ini ?? ""} size={28} />}
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
        <Bubble m={m} w={w} />
      </div>
    </div>
  );
}
