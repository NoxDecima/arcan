// src/ui/screens/auth-types.ts — shared view-model types for auth + flow screens (T2–T5).
// Used across welcome, sign-in, onboarding, invite, pairing presenters.

export interface ContactRequestVM {
  name: string;
  initials: string;
  avatarSrc?: string;
  idShort: string;
}

export interface ApproveDeviceVM {
  rows: { label: string; value: string }[];
}
