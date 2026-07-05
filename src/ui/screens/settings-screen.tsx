// src/ui/screens/settings-screen.tsx — settings presenter.
// Node-for-node port of design/proto.jsx:261–317 (SettingsScreen).
//
// patched-copy rules: theme/accent driven by props (REAL setters in live app);
// appearance section uses local lum/accentCheckColor (verbatim from proto formula);
// notification rows data-driven from props; device rows data-driven from props.
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.
//
// User decisions (2026-07-05 walkthrough):
//   1. Content column capped at 600px (mx-auto) — full-viewport desktop needs a
//      cap; the proto's pane was ~620px inside DesktopWindow.
//   2. MeRow avatar is leftmost (proto:272 has it right-aligned). Custom button
//      row used instead of PRow to support a leading ReactNode slot. Parity
//      proto-cells.jsx MeRow patched to match.

import type { ReactNode, JSX } from "react";
import {
  PHeader,
  Body,
  HAv,
  PCard,
  PSectionLabel,
  PRow,
  PToggle,
  Icon,
  tapClass,
} from "../kit";
import type {
  SettingsAccountVM,
  SettingsToggleRow,
  SettingsDeviceRow,
  ThemeName,
} from "./settings-types";

// Relative luminance (sRGB) — verbatim from design/proto.jsx window.lum.
// Formula: lum(col) > 0.55 → dark foreground, else white.
function lum(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function accentCheckColor(hex: string): string {
  return lum(hex) > 0.55 ? "#0b0d14" : "#fff";
}

export function SettingsScreen({
  account,
  onOpenProfile,
  onChangePassword,
  onRecoveryCode,
  onFeedback,
  theme,
  onTheme,
  accent,
  accentKeys,
  onAccent,
  accentSolid,
  notifications,
  notifErrorSlot,
  devices,
  onLinkDevice,
  devicesNote,
  onSignOut,
  onBack,
  // testid carries
  rootTestId,
  meRowTestId,
  meAvatarTestId,
  changePasswordTestId,
  recoveryCodeTestId,
  feedbackRowTestId,
  themeToggleTestId,
  themeLightTestId,
  themeDarkTestId,
  accentPickerTestId,
  devicesCardTestId,
  linkDeviceRowTestId,
  signOutTestId,
}: {
  account: SettingsAccountVM;
  onOpenProfile: () => void;            // MeRow → /profile/<me>
  onChangePassword: () => void;         // → /settings/change-password (Rung-3)
  onRecoveryCode: () => void;           // → /settings/recovery-code (Rung-3)
  onFeedback: () => void;               // → /settings/feedback
  // appearance — REAL setters (Unit 7 useTheme/useAccent)
  theme: ThemeName;
  onTheme: (t: ThemeName) => void;
  accent: string;
  accentKeys: string[];
  onAccent: (a: string) => void;
  accentSolid: Record<string, string>;  // hex per accent key (pure presentational constant)
  // notifications — data-driven rows
  notifications: SettingsToggleRow[];
  notifErrorSlot?: ReactNode;           // Rung-4: browser-permission error line
  // devices — real rows + app-only forget buttons
  devices: SettingsDeviceRow[];
  onLinkDevice: () => void;             // → /pair?role=initiator
  devicesNote?: ReactNode;              // Rung-4: NOX-10 soft-revoke caveat
  // sign out
  onSignOut: () => void;
  // chrome — mobile only (desktop uses the persistent sidebar)
  onBack?: () => void;
  // testid carries
  rootTestId?: string;                  // "settings-body"
  meRowTestId?: string;                 // "settings-me-row"
  meAvatarTestId?: string;              // "settings-me-avatar"
  changePasswordTestId?: string;        // "change-password-btn"
  recoveryCodeTestId?: string;          // "view-recovery-code-btn"
  feedbackRowTestId?: string;           // "feedback-row"
  themeToggleTestId?: string;           // "appearance-theme-toggle"
  themeLightTestId?: string;            // "theme-light"
  themeDarkTestId?: string;             // "theme-dark"
  accentPickerTestId?: string;          // "appearance-accent-picker"
  devicesCardTestId?: string;           // "devices-card"
  linkDeviceRowTestId?: string;         // "link-device-row"
  signOutTestId?: string;               // "sign-out-btn"
}): JSX.Element {
  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      {...(rootTestId ? { "data-testid": rootTestId } : {})}
    >
      {/* PHeader rendered only on mobile (when onBack is set) — proto:267 */}
      {onBack && <PHeader title="settings" onBack={onBack} />}

      <Body pad={14}>
        {/* 600px content cap — proto's pane was ~620px inside DesktopWindow;
            full-viewport desktop (user decision) needs an explicit cap. */}
        <div className="w-full max-w-[600px] mx-auto">
        <div className="flex flex-col gap-4">

          {/* ── account ─────────────────────────────────────────────────── */}
          <div>
            <PSectionLabel>account</PSectionLabel>
            <PCard>
              {/* MeRow — proto:272 had avatar right-aligned; user decision
                  (2026-07-05 walkthrough): avatar moves to far left. Custom
                  button row (not PRow) to allow leading ReactNode slot.
                  Proto-cells.jsx MeRow patched to match. */}
              <button
                onClick={onOpenProfile}
                data-testid={meRowTestId}
                className={[
                  tapClass,
                  "w-full text-left flex items-center gap-3 px-3.5 py-3 border-b border-hairline",
                ].join(" ")}
              >
                <HAv
                  txt={account.initials}
                  src={account.avatarSrc}
                  size={34}
                  testId={meAvatarTestId}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-body font-medium text-ui-row text-text">
                    {account.name}
                  </div>
                  <div className="mt-[3px] font-body text-ui-sub text-dim">
                    view your profile
                  </div>
                </div>
                <Icon d="chev" size={15} className="text-dim" />
              </button>
              <PRow
                icon="key"
                label="change password"
                onClick={onChangePassword}
                data-testid={changePasswordTestId}
              />
              <PRow
                icon="shield"
                label="recovery code"
                onClick={onRecoveryCode}
                last
                data-testid={recoveryCodeTestId}
              />
            </PCard>
          </div>

          {/* ── feedback ─────────────────────────────────────────────────── */}
          {/* proto:277 — accent-colored message icon */}
          <PCard>
            <PRow
              icon="message"
              iconClassName="text-arcan-accent"
              label="give feedback"
              sub="report a bug or share an idea"
              onClick={onFeedback}
              last
              data-testid={feedbackRowTestId}
            />
          </PCard>

          {/* ── appearance ───────────────────────────────────────────────── */}
          <div>
            <PSectionLabel>appearance</PSectionLabel>
            <PCard>
              {/* theme row — proto:280–285 */}
              <div
                className="flex items-center gap-3 px-[14px] py-[12px] border-b border-hairline"
                data-testid={themeToggleTestId}
              >
                <Icon
                  d={theme === "dark" ? "moon" : "sun"}
                  size={17}
                  className="text-text-2"
                />
                {/* 500 12.5px/1 body → font-body font-medium text-ui-row leading-none */}
                <span className="flex-1 font-body font-medium text-ui-row leading-none text-text">
                  theme
                </span>
                {/* segmented pill toggle — cluster */}
                <div className="flex gap-0.5 p-0.5 rounded-pill bg-panel-2 border border-hairline">
                  {(["light", "dark"] as ThemeName[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => onTheme(t)}
                      data-testid={
                        t === "light" ? themeLightTestId : themeDarkTestId
                      }
                      className={[
                        tapClass,
                        "rounded-pill px-3 py-[5px] font-mono font-semibold text-ui-sub leading-none",
                        theme === t
                          ? "bg-arcan-accent-fill text-on-accent"
                          : "text-text-2 bg-transparent",
                      ].join(" ")}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* accent row — proto:287–297 */}
              {/* py-[13px] px-[14px] matches proto padding:'13px 14px' */}
              <div
                className="px-[14px] py-[13px]"
                data-testid={accentPickerTestId}
              >
                <div className="flex items-center gap-3">
                  <Icon d="sparkle" size={17} className="text-text-2" />
                  {/* 500 12.5px/1 body */}
                  <span className="flex-1 font-body font-medium text-ui-row leading-none text-text">
                    accent color
                  </span>
                  {/* 400 11px/1 mono → font-mono text-ui-value */}
                  <span className="font-mono text-ui-value text-arcan-accent">
                    {accent}
                  </span>
                </div>

                {/* swatch grid — proto:292–296; marginTop:14 paddingLeft:29 are structural */}
                <div
                  className="flex gap-3"
                  style={{ marginTop: 14, paddingLeft: 29 }}
                >
                  {accentKeys.map((k) => {
                    const col = accentSolid[k] ?? "#7aa2f7";
                    const on = accent === k;
                    return (
                      <button
                        key={k}
                        title={k}
                        onClick={() => onAccent(k)}
                        data-testid={`accent-${k}`}
                        className={`${tapClass} w-7 h-7 rounded-pill justify-center`}
                        style={{
                          background: col,
                          border: on
                            ? "2px solid var(--color-text)"
                            : "2px solid transparent",
                          // ring + glow (shadow-dot) — proto:294, selected-only
                          boxShadow: on
                            ? "0 0 0 2px var(--color-panel), 0 0 10px var(--color-accent-dot)"
                            : "none",
                        }}
                      >
                        {on && (
                          <span
                            data-testid={`accent-check-${k}`}
                            className="flex items-center justify-center"
                            style={{ color: accentCheckColor(col) }}
                          >
                            <Icon d="check" size={14} sw={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </PCard>
          </div>

          {/* ── notifications ─────────────────────────────────────────────── */}
          <div>
            <PSectionLabel>notifications</PSectionLabel>
            <PCard>
              {notifications.map((row, i) => (
                <PRow
                  key={row.key}
                  icon={row.icon}
                  label={row.label}
                  sub={row.sub}
                  last={
                    i === notifications.length - 1 && notifErrorSlot == null
                  }
                  right={
                    <PToggle
                      on={row.on}
                      onClick={row.onToggle}
                      aria-label={row.ariaLabel}
                    />
                  }
                />
              ))}
              {/* Rung-4: browser-permission error (shown below toggles when present) */}
              {notifErrorSlot}
            </PCard>
          </div>

          {/* ── devices ───────────────────────────────────────────────────── */}
          <div>
            <PSectionLabel>devices</PSectionLabel>
            <PCard data-testid={devicesCardTestId}>
              {devices.map((row) => (
                <PRow
                  key={row.key}
                  icon="device"
                  label={row.label}
                  sub={row.sub}
                  value={row.value}
                  right={row.forgetSlot}
                  data-testid={row.testId}
                />
              ))}
              <PRow
                icon="plus"
                label="link a device"
                onClick={onLinkDevice}
                last
                data-testid={linkDeviceRowTestId}
              />
            </PCard>
            {/* Rung-4: NOX-10 soft-revoke caveat */}
            {devicesNote}
          </div>

          {/* ── sign out ──────────────────────────────────────────────────── */}
          <PCard>
            <PRow
              icon="logout"
              label="sign out"
              danger
              onClick={onSignOut}
              last
              data-testid={signOutTestId}
            />
          </PCard>

        </div>
        </div>{/* end max-w-[600px] cap */}
      </Body>
    </div>
  );
}
