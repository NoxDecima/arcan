import { describe, it, expect, afterEach, vi } from "vitest";
import {
  notificationsSupported,
  showNotification,
} from "@/platform/notifications";

describe("notifications in the shell", () => {
  it("sends via the messages channel in the shell", async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    const sendNotification = vi.fn();
    vi.doMock("@tauri-apps/plugin-notification", () => ({ sendNotification }));
    // re-import the adapter fresh so its dynamic import resolves to the mock
    vi.resetModules();
    const { showNotification, MESSAGES_CHANNEL_ID } = await import("@/platform/notifications");
    await showNotification({ title: "Arcan", body: "hi", tag: "conv-1" });
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: MESSAGES_CHANNEL_ID, title: "Arcan", body: "hi" }),
    );
    vi.doUnmock("@tauri-apps/plugin-notification");
    delete (window as any).__TAURI_INTERNALS__;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notifications on web", () => {
  it("is supported when the Notification API exists", () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    expect(notificationsSupported()).toBe(true);
  });

  it("shows a web Notification when permission is granted", async () => {
    const ctor = vi.fn(function (this: any) {
      this.close = vi.fn();
    });
    (ctor as any).permission = "granted";
    vi.stubGlobal("Notification", ctor);

    await showNotification({ title: "Arcan", body: "hi", tag: "conv-1" });
    expect(ctor).toHaveBeenCalledWith(
      "Arcan",
      expect.objectContaining({ body: "hi", tag: "conv-1" }),
    );
  });

  it("does nothing when permission is not granted", async () => {
    const ctor = vi.fn();
    (ctor as any).permission = "denied";
    vi.stubGlobal("Notification", ctor);
    await showNotification({ title: "Arcan", body: "hi", tag: "t" });
    expect(ctor).not.toHaveBeenCalled();
  });
});
