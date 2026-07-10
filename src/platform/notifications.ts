import { isTauri, isTauriAndroid } from "./is-tauri";

/**
 * Notification adapter. Web: window.Notification (unchanged behavior).
 * Shell: @tauri-apps/plugin-notification — the plugin does NOT patch the
 * web Notification API, hence this layer. Android notifications go through
 * the "messages" channel (created once at startup; the channel owns sound).
 * Plugin modules are imported dynamically so web bundles stay clean.
 */
export const MESSAGES_CHANNEL_ID = "messages";

export function notificationsSupported(): boolean {
  return isTauri() || typeof Notification !== "undefined";
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (isTauri()) {
    const { isPermissionGranted } = await import("@tauri-apps/plugin-notification");
    return (await isPermissionGranted()) ? "granted" : "default";
  }
  return typeof Notification === "undefined" ? "denied" : Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isTauri()) {
    const { requestPermission } = await import("@tauri-apps/plugin-notification");
    return (await requestPermission()) as NotificationPermission;
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
  } catch {
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
      // onClick (deep-route to conversation) is a spec stretch goal — the
      // shell notification opens/focuses the app via the OS default. The
      // plugin-notification API does not expose a click callback on Android.
    } catch {
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
