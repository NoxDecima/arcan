import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useToast } from "@/components/toast";
import { Skel } from "@/components/skeleton";
import { PCard, PSectionLabel, PRow, PToggle } from "@/ui/kit";

/**
 * notifications-section.tsx — Wave C: settings-kit imports replaced with @/ui/kit.
 * NotificationsSection is no longer rendered by SettingsBody (logic folded into
 * the container). Stays functional for isolated unit tests; Phase 4 deletes.
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
        <PSectionLabel>notifications</PSectionLabel>
        <PCard>
          <div className="flex flex-col gap-3 px-3.5 py-3">
            <Skel w="65%" h={14} />
            <Skel w="50%" h={14} />
          </div>
        </PCard>
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
      <PSectionLabel>notifications</PSectionLabel>
      <PCard>
        <PRow
          icon="bell"
          label="sound on new messages"
          right={
            <PToggle
              on={prefs.sound}
              onClick={handleSoundToggle}
              aria-label="sound on new messages"
            />
          }
        />
        <PRow
          icon="bell"
          label="browser notifications"
          sub={
            !apiSupported
              ? "not available in this environment"
              : "system alerts when a tab is hidden"
          }
          right={
            <PToggle
              on={browserEffective}
              onClick={handleBrowserToggle}
              aria-label="browser notifications"
            />
          }
          last
        />
      </PCard>
      {requestError && (
        <p data-testid="browser-error" className="mt-2 text-sm text-red">
          {requestError}
        </p>
      )}
    </div>
  );
}
