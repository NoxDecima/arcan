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
      /** Rung 4: deleted message state — renders special bubble shell. */
      deleted?: boolean;
      /** Rung 4: malformed message state — renders special bubble shell. */
      malformed?: boolean;
      /** Rung 4: edit/delete affordance rendered after the bubble. */
      menuSlot?: ReactNode;
      /** Rung 4: replaces bubble body+time (e.g. inline edit input). Parity unaffected (default undefined). */
      bodyOverride?: ReactNode;
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
