// src/ui/kit/toast.tsx — port of design/proto.jsx:590–600.
// Named KitToast to avoid collision with legacy toast until Phase 4.
// Entry animation uses the existing arcan-toast-in keyframe (grep "@keyframes arcan-toast-in" in tokens.css)
// via inline style — no utility exists; galleries disable animations anyway.

import { Icon } from "./icon";
import type { IconName } from "./icon";
import type { JSX } from "react";

export type KitToastTone = "neutral" | "success" | "error" | "accent";

const toneWash: Record<KitToastTone, string> = {
  neutral: "bg-neutral-wash",
  success: "bg-green-wash",
  error:   "bg-red-wash",
  accent:  "bg-accent-wash",
};

const toneText: Record<KitToastTone, string> = {
  neutral: "text-text-2",
  success: "text-green",
  error:   "text-red",
  accent:  "text-arcan-accent",
};

export function KitToast({
  text,
  icon = "bell",
  tone = "neutral",
}: {
  text: string;
  icon?: IconName;
  tone?: KitToastTone;
}): JSX.Element {
  return (
    <div
      className="absolute left-3.5 right-3.5 bottom-[18px] z-30 flex items-center gap-2.5 px-3.5 py-[11px] rounded-r-5 bg-panel border border-hairline shadow-toast"
      style={{ animation: "arcan-toast-in .3s cubic-bezier(.2,.8,.2,1) both" }}
    >
      <span
        className={`w-[22px] h-[22px] rounded-pill flex items-center justify-center shrink-0 ${toneWash[tone]}`}
      >
        <Icon d={icon} size={13} className={toneText[tone]} />
      </span>
      <span className="flex-1 font-body font-medium text-ui-toast text-text">
        {text}
      </span>
    </div>
  );
}
