import { describe, it, expect, afterEach, vi } from "vitest";
import {
  notificationsSupported,
  showNotification,
} from "@/platform/notifications";

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
