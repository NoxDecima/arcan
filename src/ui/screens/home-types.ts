// src/ui/screens/home-types.ts — view-model types for home screen presenters.
// Pure data contracts: no Jazz, no router.

export interface ConvoItem {
  id: string;
  name: string;
  initials: string;
  avatarSrc?: string;
  group?: boolean;
  preview: string;
  time: string;
  unread: number;
}

export interface ContactItem {
  id: string;
  name: string;
  initials: string;
  avatarSrc?: string;
}

export interface HomeProfile {
  name: string;
  initials: string;
  avatarSrc?: string;
}
