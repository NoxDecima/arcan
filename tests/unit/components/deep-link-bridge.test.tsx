/**
 * DeepLinkBridge component tests.
 *
 * Key assertions:
 * 1. initDeepLinks called exactly once on mount.
 * 2. Re-render does NOT call initDeepLinks again (C1 regression guard).
 * 3. Unmount before init resolves → late-resolved unlisten fn is invoked
 *    (cancelled-flag cleanup).
 * 4. Same-origin URL → navigate called with path+search+hash.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

// ----- module mocks -----
// vi.mock factories are hoisted, so they cannot reference module-level lets.
// We use a shared mutable object instead.

const state: {
  capturedOnUrl: ((url: string) => void) | null;
  resolveInit: ((fn: () => void) => void) | null;
} = { capturedOnUrl: null, resolveInit: null };

vi.mock("@/platform/deep-link", () => ({
  initDeepLinks: vi.fn((onUrl: (url: string) => void): Promise<() => void> => {
    state.capturedOnUrl = onUrl;
    return new Promise((resolve) => {
      state.resolveInit = resolve;
    });
  }),
  classifyIncomingUrl: vi.fn((raw: string, currentOrigin: string) => {
    try {
      const url = new URL(raw);
      if (url.origin === currentOrigin) {
        return { kind: "navigate", to: `${url.pathname}${url.search}${url.hash}` };
      }
    } catch {
      /* ignore */
    }
    return null;
  }),
}));

vi.mock("@/platform/is-tauri", () => ({
  isTauri: () => true,
}));

vi.mock("@/platform/server-config", () => ({
  getServerOrigin: vi.fn(() => "https://chat.example.com"),
  setServerOverride: vi.fn(),
  probeServer: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/platform/auth-transport", () => ({
  clearAuthToken: vi.fn(),
}));

// Mock useConfirm — not invoked in same-origin tests but must not throw.
vi.mock("@/components/confirm-dialog", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));

import { initDeepLinks } from "@/platform/deep-link";
import { DeepLinkBridge } from "@/components/deep-link-bridge";

const initDeepLinksMock = vi.mocked(initDeepLinks);

// ----- helpers -----

function renderBridge() {
  return render(
    <MemoryRouter>
      <DeepLinkBridge />
    </MemoryRouter>,
  );
}

// ----- tests -----

beforeEach(() => {
  state.capturedOnUrl = null;
  state.resolveInit = null;
  // Restore the capturing implementation after each test (clearAllMocks/restoreAllMocks
  // would wipe it). Re-apply it directly on the spy.
  initDeepLinksMock.mockImplementation((onUrl: (url: string) => void): Promise<() => void> => {
    state.capturedOnUrl = onUrl;
    return new Promise((resolve) => {
      state.resolveInit = resolve;
    });
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DeepLinkBridge", () => {
  it("(1) calls initDeepLinks exactly once on mount", () => {
    renderBridge();
    expect(initDeepLinksMock).toHaveBeenCalledTimes(1);
  });

  it("(2) re-render does NOT call initDeepLinks again", () => {
    const { rerender } = renderBridge();
    expect(initDeepLinksMock).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter initialEntries={["/conversations"]}>
        <DeepLinkBridge />
      </MemoryRouter>,
    );
    rerender(
      <MemoryRouter initialEntries={["/settings"]}>
        <DeepLinkBridge />
      </MemoryRouter>,
    );
    expect(initDeepLinksMock).toHaveBeenCalledTimes(1);
  });

  it("(3) unmount before init resolves → late-resolved unlisten fn is invoked", async () => {
    const unlistenSpy = vi.fn();
    const { unmount } = renderBridge();
    expect(initDeepLinksMock).toHaveBeenCalledTimes(1);
    expect(state.resolveInit).not.toBeNull();

    // Unmount before the promise settles.
    unmount();

    // Now resolve the init promise with the unlisten spy.
    await act(async () => {
      state.resolveInit!(unlistenSpy);
      await Promise.resolve();
    });

    // The cancelled-flag path must have called the late-resolved fn.
    expect(unlistenSpy).toHaveBeenCalledTimes(1);
  });

  it("(4) same-origin URL → navigate called with path+search+hash", async () => {
    const unlistenSpy = vi.fn();

    // Track location changes inside the router using a probe component.
    let observedPath = "/";
    function LocationProbe() {
      const loc = useLocation();
      observedPath = `${loc.pathname}${loc.search}${loc.hash}`;
      return null;
    }

    // Render synchronously (not inside act) so effects flush immediately and
    // state.resolveInit is populated before we try to call it.
    render(
      <MemoryRouter initialEntries={["/"]}>
        <DeepLinkBridge />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    // By now React has run the mount effect and called initDeepLinks,
    // so state.resolveInit is the pending promise resolver.
    expect(state.resolveInit).not.toBeNull();

    // Resolve init so the subscription is live.
    await act(async () => {
      state.resolveInit!(unlistenSpy);
      await Promise.resolve();
    });

    // Fire a same-origin URL through the captured handler.
    await act(async () => {
      state.capturedOnUrl!("https://chat.example.com/invite?ref=123#frag");
      await Promise.resolve();
    });

    // The router should have navigated to the correct path.
    expect(observedPath).toBe("/invite?ref=123#frag");
  });
});
