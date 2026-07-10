import { isTauri, isTauriAndroid } from "./is-tauri";

/**
 * Notification adapter. Web: window.Notification (unchanged behavior).
 * Shell: @tauri-apps/plugin-notification. The plugin DOES patch window.Notification
 * in shell webviews (injected init script), but without channel routing — this
 * adapter exists for explicit channel routing (channelId "messages") + permission
 * control. The web-path fallback below must never run in the shell: the patched
 * constructor would fire channel-less notifications that Android drops silently.
 * Plugin modules are imported dynamically so web bundles stay clean.
 */
export const MESSAGES_CHANNEL_ID = "messages";

export function notificationsSupported(): boolean {
  return isTauri() || typeof Notification !== "undefined";
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (isTauri()) {
    const { isPermissionGranted } = await import("@tauri-apps/plugin-notification");
    // Deliberately lossy: isPermissionGranted false covers both "default" and "denied"
    // (indistinguishable via this API). Self-corrects when the user toggles in OS settings.
    return (await isPermissionGranted()) ? "granted" : "default";
  }
  return typeof Notification === "undefined" ? "denied" : Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isTauri()) {
    const { requestPermission } = await import("@tauri-apps/plugin-notification");
    // The plugin returns raw Tauri PermissionState which includes "prompt" and
    // "prompt-with-rationale" (Android) — normalize to the web NotificationPermission type.
    const result = await requestPermission();
    return result === "granted" || result === "denied" ? result : "default";
  }
  return Notification.requestPermission();
}

/**
 * Android: create the messages channel once at startup (idempotent).
 * This is a no-op on web and non-Android Tauri shells and must never
 * throw into app startup.
 */
export async function initNotificationChannel(): Promise<void> {
  if (!isTauriAndroid()) return;
  try {
    const { createChannel, Importance } = await import("@tauri-apps/plugin-notification");
    await createChannel({
      id: MESSAGES_CHANNEL_ID,
      name: "Messages",
      description: "New message notifications",
      importance: Importance.High,
    });
  } catch (err) {
    console.warn("[notifications]", err);
    // Channel creation failing must never break app startup.
  }
}

export interface ShowNotificationOptions {
  title: string;
  body: string;
  tag: string;
  onClick?: () => void;
}

export async function showNotification(opts: ShowNotificationOptions): Promise<void> {
  if (isTauri()) {
    try {
      const { sendNotification } = await import("@tauri-apps/plugin-notification");
      sendNotification({
        title: opts.title,
        body: opts.body,
        channelId: MESSAGES_CHANNEL_ID,
      });
      // Tap-to-route deep-linking via the plugin's onAction is a deferred stretch goal
      // (plan §Plan-time decisions 3); OS default (open app) applies.
    } catch (err) {
      console.warn("[notifications]", err);
      /* never throw into the notification fanout path */
    }
    return;
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }
  const n = new Notification(opts.title, {
    body: opts.body,
    tag: opts.tag,
    renotify: false,
  } as NotificationOptions);
  if (opts.onClick) {
    n.onclick = () => {
      opts.onClick?.();
      n.close();
    };
  }
}
