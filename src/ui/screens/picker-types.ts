// src/ui/screens/picker-types.ts — shared view-model types for picker screens
// (ConvoSettingsScreen, NewConvoScreen, AddPeopleScreen).
//
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode } from "react";

export interface PickItem {
  id: string;
  name: string;
  initials: string;
  avatarSrc?: string;
}

export interface ConvoMemberVM {
  accountID: string;
  name: string;
  initials: string;
  avatarSrc?: string;
  role: "admin" | "writer";
  /** True when this member is the logged-in user. */
  you?: boolean;
}

// Re-export ReactNode for consumers that need it alongside these types.
export type { ReactNode };
