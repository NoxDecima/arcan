import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { classifyIncomingUrl, _resetInitialUrlConsumedForTests } from "@/platform/deep-link";

beforeEach(() => {
  _resetInitialUrlConsumedForTests();
});

describe("classifyIncomingUrl", () => {
  const current = "https://chat.meteory.eu";

  it("maps a same-origin invite URL to an in-app navigation", () => {
    expect(
      classifyIncomingUrl("https://chat.meteory.eu/invite#frag123", current),
    ).toEqual({ kind: "navigate", to: "/invite#frag123" });
  });

  it("preserves search and hash", () => {
    expect(
      classifyIncomingUrl("https://chat.meteory.eu/pair?step=2#secret", current),
    ).toEqual({ kind: "navigate", to: "/pair?step=2#secret" });
  });

  it("flags a foreign-instance URL for the switch prompt", () => {
    expect(
      classifyIncomingUrl("https://other.example/invite#frag", current),
    ).toEqual({
      kind: "foreign",
      origin: "https://other.example",
      to: "/invite#frag",
      hash: "#frag",
      isInvite: true,
    });
  });

  it("rejects garbage", () => {
    expect(classifyIncomingUrl("not a url", current)).toBeNull();
    expect(classifyIncomingUrl("http://insecure.example/invite", current)).toBeNull();
  });

  it("classifies /invite as isInvite true (exact path)", () => {
    expect(
      classifyIncomingUrl("https://other.example/invite", current),
    ).toMatchObject({ kind: "foreign", isInvite: true });
  });

  it("classifies /invite/<sub> as isInvite true (prefix)", () => {
    expect(
      classifyIncomingUrl("https://other.example/invite/abc123", current),
    ).toMatchObject({ kind: "foreign", isInvite: true });
  });

  it("classifies /invitees as isInvite false (foreign kind, not an invite)", () => {
    expect(
      classifyIncomingUrl("https://other.example/invitees", current),
    ).toMatchObject({ kind: "foreign", isInvite: false });
  });
});

describe("initDeepLinks once-flag", () => {
  let originalTauriInternals: unknown;

  beforeEach(() => {
    originalTauriInternals = (window as Record<string, unknown>).__TAURI_INTERNALS__;
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    if (originalTauriInternals === undefined) {
      delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
    } else {
      (window as Record<string, unknown>).__TAURI_INTERNALS__ = originalTauriInternals;
    }
    vi.doUnmock("@tauri-apps/plugin-deep-link");
    vi.resetModules();
  });

  it("calls getCurrent once even when initDeepLinks is called twice, and resets after _resetInitialUrlConsumedForTests", async () => {
    const unlistenSpy = vi.fn();
    const getCurrentMock = vi.fn().mockResolvedValue(["https://x.example/invite#f"]);
    const onOpenUrlMock = vi.fn().mockResolvedValue(unlistenSpy);

    vi.doMock("@tauri-apps/plugin-deep-link", () => ({
      getCurrent: getCurrentMock,
      onOpenUrl: onOpenUrlMock,
    }));

    vi.resetModules();
    const { initDeepLinks: init, _resetInitialUrlConsumedForTests: resetFlag } =
      await import("@/platform/deep-link");

    const cb = vi.fn();

    // First call: getCurrent should be called, cb fired once with the URL.
    await init(cb);
    expect(getCurrentMock).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith("https://x.example/invite#f");

    // Second call: getCurrent must NOT be called again (once-flag is set).
    await init(cb);
    expect(getCurrentMock).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);

    // Reset the flag; third call should hit getCurrent again.
    resetFlag();
    await init(cb);
    expect(getCurrentMock).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
