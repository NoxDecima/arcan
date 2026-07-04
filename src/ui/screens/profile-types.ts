// src/ui/screens/profile-types.ts — view-model types for profile screens.
// Pure: no Jazz, no router.

import type { ReactNode } from "react";

export interface ProfileScreenVM {         // contact / "other" (proto:205–236)
  name: string;                            // plain, no "@" (rule 4)
  initials: string;
  avatarSrc?: string;
  idShort: string;                         // "co_z1a8…4f2"
  /** Rung-4 real data. undefined → render proto "soon" placeholder row. */
  sharedConversations?: { id: string; title: string }[];
}

export interface OwnProfileScreenVM {       // own (proto:238–259)
  name: string;
  initials: string;
  avatarSrc?: string;
  idShort: string;
}

// ReactNode imported for slot props in the screen files.
export type { ReactNode };
