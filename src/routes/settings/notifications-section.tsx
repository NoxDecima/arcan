import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Button } from "@/components/ui/button";

/**
 * NotificationsSection: toggles for in-app notification preferences.
 *
 * Sound toggle: simple boolean write to me.root.settings.notifications.sound.
 *
 * Browser notification enable: a click-to-enable flow that:
 *   1. Calls Notification.requestPermission()
 *   2. On "granted" → sets me.root.settings.notifications.browser = true
 *   3. On "denied" → shows inline "blocked at browser level" hint
 *   4. On "default" (user dismissed) → no state change
 *
 * The user can independently toggle our app's use of browser notifications
 * off (settings.notifications.browser = false) without revoking OS permission.
 * Effective state shown: prefs.browser && Notification.permission === "granted".
 */
export function NotificationsSection() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { settings: { notifications: true } } },
  });
  const [permissionState, setPermissionState] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );
  const [requestError, setRequestError] = useState<string | null>(null);

  if (!me.$isLoaded || !(me.root as any)?.settings?.notifications) {
    return (
      <section>
        <h2 className="text-base font-semibold text-text mb-2">Notifications</h2>
        <p className="text-sm text-dim">Loading…</p>
      </section>
    );
  }

  const prefs = (me.root as any).settings.notifications;
  const apiSupported = typeof Notification !== "undefined";
  const browserEffective = prefs.browser && permissionState === "granted";

  function handleSoundToggle() {
    prefs.$jazz.set("sound", !prefs.sound);
  }

  async function handleEnableBrowser() {
    setRequestError(null);
    if (!apiSupported) {
      setRequestError("Browser notifications are not available in this environment.");
      return;
    }
    try {
      // Call requestPermission unconditionally — checking
      // Notification.permission first isn't reliable across browsers
      // (Playwright e.g. reports "denied" via the getter even when the
      // context will resolve a fresh request to "granted"). The browser
      // itself decides whether to actually prompt or short-circuit to
      // the previously-set value.
      const result = await Notification.requestPermission();
      setPermissionState(result);
      if (result === "granted") {
        prefs.$jazz.set("browser", true);
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
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-2">Notifications</h2>
      <div className="bg-panel rounded border border-hairline px-4 py-3 flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="sound-toggle"
            checked={prefs.sound}
            onChange={handleSoundToggle}
          />
          Play sound when new messages arrive
        </label>

        <div className="flex flex-col gap-2">
          <div className="text-sm">
            Browser notifications:{" "}
            <span
              data-testid="browser-status"
              className={browserEffective ? "text-green" : "text-dim"}
            >
              {browserEffective ? "Enabled" : "Not enabled"}
            </span>
          </div>
          {!browserEffective ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleEnableBrowser()}
              data-testid="enable-browser-notifications"
              disabled={!apiSupported}
              className="self-start"
            >
              Enable browser notifications
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisableBrowser}
              data-testid="disable-browser-notifications"
              className="self-start"
            >
              Disable
            </Button>
          )}
          {requestError && (
            <p
              data-testid="browser-error"
              className="text-sm text-destructive"
            >
              {requestError}
            </p>
          )}
          {!apiSupported && (
            <p className="text-xs text-dim">
              Browser notifications aren't available in this environment.
            </p>
          )}
          <p className="text-xs text-dim">
            Once enabled, you'll see system notifications when a new message
            arrives in a conversation while this tab is hidden.
          </p>
        </div>
      </div>
    </section>
  );
}
