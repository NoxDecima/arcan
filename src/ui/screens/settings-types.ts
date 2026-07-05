// src/ui/screens/settings-types.ts — view-model types for the settings cluster.
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode } from "react";
import type { IconName } from "../kit";

export interface SettingsAccountVM {
  name: string;
  initials: string;
  avatarSrc?: string;
}

export interface SettingsToggleRow {
  key: string;
  label: string;
  sub?: string;
  on: boolean;
  onToggle: () => void;
  ariaLabel: string;
  /** Optional per-row icon (e.g. "bell", "at") — passed through to PRow. */
  icon?: IconName;
}

export interface SettingsDeviceRow {
  key: string;
  label: string;
  sub?: string;
  value?: string;
  /** Rung-4 app-only "forget" button (disabled for current device). */
  forgetSlot?: ReactNode;
  /** Optional testid for the PRow wrapper — carries `device-row-<idx>`. */
  testId?: string;
}

export type ThemeName = "light" | "dark";
