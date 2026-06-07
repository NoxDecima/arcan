import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { NotificationManager } from "@/components/notification-manager";

// Mock the diff tracker so we control when onNewMessage fires.
let mostRecentArgs: any = null;
vi.mock("@/hooks/useNewMessageEvents", () => ({
  useNewMessageEvents: (args: any) => {
    mostRecentArgs = args;
  },
}));
// Stub the title hook — its behavior is tested separately.
vi.mock("@/hooks/useTabTitleBadge", () => ({
  useTabTitleBadge: () => {},
}));
// Stub useAccount so the unit test can run without a Jazz provider. The
// component prefers an explicit `me` prop when provided (the test pattern
// below), so the value here just has to be non-throwing.
vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({}),
}));

describe("NotificationManager — sound + browser notification fanout", () => {
  let originalAudio: any;
  let originalNotification: any;
  let playSpy: ReturnType<typeof vi.fn>;
  let notifCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mostRecentArgs = null;
    originalAudio = (globalThis as any).Audio;
    originalNotification = (globalThis as any).Notification;
    playSpy = vi.fn().mockResolvedValue(undefined);
    (globalThis as any).Audio = vi.fn(function (this: any) {
      this.play = playSpy;
    });
    notifCtor = vi.fn(function (this: any) {
      this.close = vi.fn();
    });
    (notifCtor as any).permission = "granted";
    (notifCtor as any).requestPermission = vi.fn();
    (globalThis as any).Notification = notifCtor;
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
  });

  afterEach(() => {
    (globalThis as any).Audio = originalAudio;
    (globalThis as any).Notification = originalNotification;
  });

  function renderWith(prefs: { sound: boolean; browser: boolean }) {
    const me = {
      $jazz: { id: "co_zMe" },
      root: {
        knownConversations: [{ $jazz: { id: "c1" }, messages: [] }],
        lastReadAt: {},
        notificationPrefs: prefs,
      },
    };
    render(React.createElement(NotificationManager, { me }));
  }

  test("plays sound on new message when sound=true + hidden", () => {
    renderWith({ sound: true, browser: false });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  test("does NOT play sound when sound=false", () => {
    renderWith({ sound: false, browser: false });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(playSpy).not.toHaveBeenCalled();
  });

  test("does NOT play sound when document is visible", () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    renderWith({ sound: true, browser: false });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(playSpy).not.toHaveBeenCalled();
  });

  test("creates Notification when browser=true + granted + hidden", () => {
    renderWith({ sound: false, browser: true });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(notifCtor).toHaveBeenCalledTimes(1);
    const [title, opts] = notifCtor.mock.calls[0];
    expect(title).toBe("Arcan");
    expect(opts.body).toBe("New message in Alice");
    expect(opts.tag).toBe("conv-c1");
  });

  test("does NOT create Notification when browser=false", () => {
    renderWith({ sound: false, browser: false });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(notifCtor).not.toHaveBeenCalled();
  });

  test("does NOT create Notification when permission=denied", () => {
    (notifCtor as any).permission = "denied";
    renderWith({ sound: false, browser: true });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(notifCtor).not.toHaveBeenCalled();
  });

  test("does NOT create Notification when document is visible", () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    renderWith({ sound: false, browser: true });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(notifCtor).not.toHaveBeenCalled();
  });

  test("audio play() rejection is swallowed silently", async () => {
    playSpy.mockRejectedValueOnce(new Error("autoplay blocked"));
    renderWith({ sound: true, browser: false });
    expect(() =>
      mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" }),
    ).not.toThrow();
  });
});
