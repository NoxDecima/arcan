import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useToast } from "@/components/toast";
import { Skel } from "@/components/skeleton";
import { Card, SectionLabel, SRow, Toggle } from "./settings-kit";

/**
 * NotificationsSection: slider toggles for notification preferences (Unit 9-5b,
 * 4-G). Two options:
 *   • sound on new messages  → settings.notifications.sound
 *   • browser notifications  → settings.notifications.browser, gated on the
 *     real Notification permission.
 *
 * Browser slider flow (preserved verbatim from Slice 8):
 *   - Flip ON  → Notification.requestPermission():
 *       "granted" → prefs.browser = true (slider shows ON)
 *       "denied"  → inline error, slider stays OFF
 *       "default" → user dismissed, no state change
 *   - Flip OFF → prefs.browser = false (OS permission untouched)
 * Effective ON = prefs.browser && Notification.permission === "granted".
 *
 * The kit Toggle (9-5a) has no `disabled` prop; when the Notification API is
 * unavailable the click handler short-circuits and surfaces the inline note.
 */
export function NotificationsSection() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { settings: { notifications: true } } },
  });
  const [permissionState, setPermissionState] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );
  const [requestError, setRequestError] = useState<string | null>(null);
  const toast = useToast();

  if (!me.$isLoaded || !(me.root as any)?.settings?.notifications) {
    return (
      <div data-testid="notifications-section-loading">
        <SectionLabel>notifications</SectionLabel>
        <Card>
          <div className="flex flex-col gap-3 px-3.5 py-3">
            <Skel w="65%" h={14} />
            <Skel w="50%" h={14} />
          </div>
        </Card>
      </div>
    );
  }

  const prefs = (me.root as any).settings.notifications;
  const apiSupported = typeof Notification !== "undefined";
  const browserEffective = prefs.browser && permissionState === "granted";

  function handleSoundToggle() {
    prefs.$jazz.set("sound", !prefs.sound);
    toast({ icon: "check", text: "notifications updated", tone: "success" });
  }

  async function handleEnableBrowser() {
    setRequestError(null);
    if (!apiSupported) {
      setRequestError("Browser notifications are not available in this environment.");
      return;
    }
    try {
      // Call requestPermission unconditionally — checking Notification.permission
      // first isn't reliable across browsers (Playwright reports "denied" via the
      // getter even when a fresh request resolves "granted"). The browser decides
      // whether to prompt or short-circuit to the previously-set value.
      const result = await Notification.requestPermission();
      setPermissionState(result);
      if (result === "granted") {
        prefs.$jazz.set("browser", true);
        toast({ icon: "check", text: "notifications updated", tone: "success" });
      } else if (result === "denied") {
        setRequestError(
          "Notifications were declined. Re-enable in your browser settings to try again.",
        );
      }
      // "default" → user dismissed; no state change.
    } catch (err) {
      setRequestError(
        err instanceof Error ? err.message : "Failed to request permission.",
      );
    }
  }

  function handleDisableBrowser() {
    prefs.$jazz.set("browser", false);
    toast({ icon: "check", text: "notifications updated", tone: "success" });
  }

  function handleBrowserToggle() {
    if (browserEffective) handleDisableBrowser();
    else void handleEnableBrowser();
  }

  return (
    <div>
      <SectionLabel>notifications</SectionLabel>
      <Card>
        <SRow
          icon="bell"
          label="sound on new messages"
          control={
            <Toggle
              on={prefs.sound}
              onClick={handleSoundToggle}
              aria-label="sound on new messages"
            />
          }
        />
        <SRow
          icon="bell"
          label="browser notifications"
          sub={
            !apiSupported
              ? "not available in this environment"
              : "system alerts when a tab is hidden"
          }
          control={
            <Toggle
              on={browserEffective}
              onClick={handleBrowserToggle}
              aria-label="browser notifications"
            />
          }
          last
        />
      </Card>
      {requestError && (
        <p data-testid="browser-error" className="mt-2 text-sm text-red">
          {requestError}
        </p>
      )}
    </div>
  );
}
