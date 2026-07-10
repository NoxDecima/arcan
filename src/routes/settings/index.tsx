import { useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAccount, useLogOut } from "jazz-tools/react";
import type { Account } from "jazz-tools";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useTheme } from "@/styles/use-theme";
import { useAccent, ACCENT_KEYS, type Accent } from "@/styles/use-accent";
import { useIsDesktop } from "@/components/use-is-desktop";
import { useAccountAvatars } from "@/components/use-account-avatars";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { getCurrentSessionFingerprint } from "@/auth/session";
import { authClient } from "@/auth/client";
import { ChangePasswordRoute } from "./change-password-route";
import { RecoveryCodeRoute } from "./recovery-code-route";
import { FeedbackRoute } from "./feedback-route";
import { SettingsScreen } from "@/ui/screens/settings-screen";
import type {
  SettingsDeviceRow,
  SettingsToggleRow,
} from "@/ui/screens/settings-types";

// Accent hex values (verbatim from design/proto.jsx). Defined here so the
// presenter receives them as a plain prop (pure — no imports from appearance-section).
const ACCENT_SWATCH: Record<Accent, string> = {
  tokyo:  "#7aa2f7",
  violet: "#bb9af7",
  teal:   "#73daca",
  lime:   "#9ece6a",
  amber:  "#e0af68",
  rose:   "#f7768e",
};

/**
 * SettingsBody: container for the settings landing page.
 *
 * Wave C (Unit 10): folds AccountSection / AppearanceSection /
 * NotificationsSection / DevicesSection / FeedbackRow / SignOutCard into a
 * single container that renders <SettingsScreen>. All section files stay on
 * disk for isolated unit tests (Phase 4 deletes them). settings-kit is no
 * longer imported anywhere in src/ after this change.
 */
function SettingsBody() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const logOut = useLogOut();
  const confirmDialog = useConfirm();

  const me = useAccount(ArcanAccount, {
    resolve: {
      profile: true,
      root: {
        devices: { $each: true },
        settings: { appearance: true, notifications: true },
      },
    },
  });

  // ── notifications local state ────────────────────────────────────────────
  const [permissionState, setPermissionState] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );
  const [notifError, setNotifError] = useState<string | null>(null);

  // Own avatar — resolved via the shared useAccountAvatars hook (live; same
  // subscription pattern as home lists). Must be called before any early return.
  const myIDPreLoad = me.$isLoaded
    ? ((me as any).$jazz?.id as string | undefined)
    : undefined;
  const ownAvatarMap = useAccountAvatars(me, myIDPreLoad ? [myIDPreLoad] : []);

  if (!me.$isLoaded) return null;

  const myID = myIDPreLoad;
  const displayName = me.profile?.displayName ?? "";
  const initials = displayName[0]?.toUpperCase() ?? "?";

  // ── appearance ───────────────────────────────────────────────────────────
  function handleTheme(t: "light" | "dark") {
    setTheme(t);
    ((me as any).root.settings?.appearance as any)?.$jazz?.set("theme", t);
  }
  function handleAccent(a: string) {
    const acc = a as Accent;
    setAccent(acc);
    ((me as any).root.settings?.appearance as any)?.$jazz?.set("accent", acc);
  }

  // ── notifications ────────────────────────────────────────────────────────
  const prefs = (me.root as any)?.settings?.notifications;
  const apiSupported = typeof Notification !== "undefined";
  const browserEffective = prefs?.browser && permissionState === "granted";

  function handleSoundToggle() {
    prefs?.$jazz?.set("sound", !prefs.sound);
  }
  async function handleBrowserToggle() {
    if (browserEffective) {
      prefs?.$jazz?.set("browser", false);
      return;
    }
    setNotifError(null);
    if (!apiSupported) {
      setNotifError("Browser notifications are not available in this environment.");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermissionState(result);
      if (result === "granted") {
        prefs?.$jazz?.set("browser", true);
      } else if (result === "denied") {
        setNotifError(
          "Notifications were declined. Re-enable in your browser settings to try again.",
        );
      }
    } catch (err) {
      setNotifError(
        err instanceof Error ? err.message : "Failed to request permission.",
      );
    }
  }
  const notifications: SettingsToggleRow[] = [
    {
      key: "sound",
      icon: "bell",
      label: "sound on new messages",
      on: !!prefs?.sound,
      onToggle: handleSoundToggle,
      ariaLabel: "sound on new messages",
    },
    {
      key: "browser",
      icon: "bell",
      label: "browser notifications",
      sub: !apiSupported
        ? "not available in this environment"
        : "system alerts when a tab is hidden",
      on: !!browserEffective,
      onToggle: () => void handleBrowserToggle(),
      ariaLabel: "browser notifications",
    },
  ];

  // ── devices ──────────────────────────────────────────────────────────────
  let currentFingerprint: string | null = null;
  try {
    currentFingerprint = getCurrentSessionFingerprint(me as unknown as Account);
  } catch {
    // Non-local account (test fixtures).
  }
  const activeDevices = (me.root.devices ?? []).filter((d) => d && !d.revoked);

  async function handleRevoke(idx: number) {
    const device = activeDevices[idx];
    if (!device) return;
    const ok = await confirmDialog({
      title: "forget device",
      body: "it stays hidden from your list, but anything already synced to it remains readable. full cryptographic revocation lands in a later release.",
      confirmLabel: "forget device",
      testId: "confirm-forget-device",
    });
    if (ok) (device as any).$jazz.set("revoked", true);
  }

  const devices: SettingsDeviceRow[] = activeDevices.map((device, idx) => {
    const isCurrentDevice =
      currentFingerprint !== null &&
      (device as any).sessionFingerprint === currentFingerprint;
    const added =
      device.addedAt instanceof Date
        ? device.addedAt.toLocaleDateString()
        : new Date(device.addedAt).toLocaleDateString();
    return {
      key: String(idx),
      label: device.label + (isCurrentDevice ? " · this device" : ""),
      sub: `added ${added}`,
      forgetSlot: (
        <Button
          variant="outline"
          size="sm"
          data-testid={`revoke-device-btn-${idx}`}
          onClick={() => handleRevoke(idx)}
          disabled={isCurrentDevice}
          title={
            isCurrentDevice
              ? "This is your current device — use Sign out instead."
              : undefined
          }
        >
          forget
        </Button>
      ),
      testId: `device-row-${idx}`,
    };
  });

  // ── sign out ─────────────────────────────────────────────────────────────
  async function handleSignOut() {
    const ok = await confirmDialog({
      title: "sign out",
      body: "you'll need your password to sign back in. local data on this device is cleared.",
      confirmLabel: "sign out",
      testId: "confirm-sign-out",
    });
    if (!ok) return;
    try {
      await authClient.signOut();
    } catch {
      // Network failure shouldn't block local logOut.
    }
    logOut();
  }

  return (
    <SettingsScreen
      account={{
        name: displayName,
        initials,
        avatarSrc: myID ? (ownAvatarMap.get(myID) ?? undefined) : undefined,
      }}
      onOpenProfile={() => myID && navigate(`/profile/${myID}`)}
      onChangePassword={() => navigate("/settings/change-password")}
      onRecoveryCode={() => navigate("/settings/recovery-code")}
      onFeedback={() => navigate("/settings/feedback")}
      onInviteLinks={() => navigate("/connections/live-invites")}
      theme={theme}
      onTheme={handleTheme}
      accent={accent}
      accentKeys={[...ACCENT_KEYS]}
      onAccent={handleAccent}
      accentSolid={ACCENT_SWATCH}
      notifications={notifications}
      notifErrorSlot={
        notifError ? (
          <p data-testid="browser-error" className="px-3.5 pb-2 text-sm text-red">
            {notifError}
          </p>
        ) : undefined
      }
      devices={devices}
      onLinkDevice={() => navigate("/pair?role=initiator")}
      devicesNote={
        <p className="mt-3 max-w-xl text-xs leading-relaxed text-dim">
          forgetting a device hides it here, but it can still read everything it
          has already synced. full cryptographic revocation lands in the upcoming
          overhaul — see NOX-10.
        </p>
      }
      onSignOut={() => void handleSignOut()}
      onBack={!isDesktop ? () => navigate(-1) : undefined}
      // testid carries (E2E + unit)
      rootTestId="settings-body"
      meRowTestId="settings-me-row"
      meAvatarTestId="settings-me-avatar"
      changePasswordTestId="change-password-btn"
      recoveryCodeTestId="view-recovery-code-btn"
      feedbackRowTestId="feedback-row"
      themeToggleTestId="appearance-theme-toggle"
      themeLightTestId="theme-light"
      themeDarkTestId="theme-dark"
      accentPickerTestId="appearance-accent-picker"
      devicesCardTestId="devices-card"
      linkDeviceRowTestId="link-device-row"
      inviteLinksTestId="settings-invite-links"
      signOutTestId="sign-out-btn"
    />
  );
}

/**
 * SettingsRoute: dispatcher for the /settings/* route group.
 *
 * Unit 9-2: the change-password and view-recovery-code flows are now
 * dedicated routes (formerly modals opened from the account section) so the
 * persistent AppShell sidebar stays mounted around them. Sub-route paths are
 * relative to /settings (this component is the element for `/settings/*`).
 */
export function SettingsRoute() {
  return (
    <Routes>
      <Route index element={<SettingsBody />} />
      <Route path="change-password" element={<ChangePasswordRoute />} />
      <Route path="recovery-code" element={<RecoveryCodeRoute />} />
      <Route path="feedback" element={<FeedbackRoute />} />
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
  );
}
