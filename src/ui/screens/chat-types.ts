// src/ui/screens/chat-types.ts — view-model types for chat screen presenters.
// Pure data contracts: no Jazz, no router.

import type { ReactNode } from "react";

export type ChatTimelineItem =
  | { kind: "day"; label: string; key: string }
  | { kind: "new"; key: string }
  | { kind: "sys"; text: string; key: string; testId?: string }
  | {
      kind: "msg";
      key: string;
      mine: boolean;
      text: string;
      time: string;
      authorName?: string;
      authorInitials?: string;
      authorAvatarSrc?: string;
      att?: boolean;
      /** Rung 4: real attachment content from the container. */
      attSlot?: ReactNode;
      /** Message was edited — "· edited" joins the caption below the bubble (feedback round 4). */
      edited?: boolean;
      /** Rung 4: deleted message state — renders special bubble shell. */
      deleted?: boolean;
      /** Rung 4: malformed message state — renders special bubble shell. */
      malformed?: boolean;
      /** Rung 4: edit/delete affordance rendered after the bubble. */
      menuSlot?: ReactNode;
      /** Rung 4: replaces bubble body+time (e.g. inline edit input). Parity unaffected (default undefined). */
      bodyOverride?: ReactNode;
      /** Intent-fix (2026-07-08 walkthrough): tap on the author avatar —
          container navigates to the author's profile. Non-visual. */
      onAvatar?: () => void;
      /** intent-fix (feedback round 2, non-visual): right-click / long-press
       * opens the message context menu. Non-visual. Receives the interaction
       * point (viewport coords) for pointer-anchored menu placement (R2+R3). */
      onContext?: (at: { x: number; y: number }) => void;
      /** UI motion (2026-07-18): appended after the timeline's initial
       * render — MessageRow plays arcan-rise once. Never set on history
       * (AUDIT-011). */
      entering?: boolean;
    };

export interface ChatHeaderVM {
  /** 1:1 → "@name" (mono headMono rule, proto:175), group → name */
  title: string;
  /** group → "// N members"; 1:1 → undefined (presence dropped NOX-31/33) */
  sub?: string;
  initials: string;
  avatarSrc?: string;
  group?: boolean;
}
