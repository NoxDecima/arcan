/**
 * ServerOverride component tests.
 *
 * The component is shell-only: isTauri() gates the whole render.
 * We stub __TAURI_INTERNALS__ to exercise the Tauri branch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ----- module mocks -----

// server-config: let setServerOverride validate (real impl) but spy on it;
// provide controllable return values for getServerOrigin / getServerOverride / bakedOrigin.
vi.mock("@/platform/server-config", () => ({
  bakedOrigin: vi.fn(() => "https://arcan.example"),
  getServerOrigin: vi.fn(() => "https://arcan.example"),
  getServerOverride: vi.fn(() => null),
  setServerOverride: vi.fn(),
  clearServerOverride: vi.fn(),
}));

vi.mock("@/platform/auth-transport", () => ({
  clearAuthToken: vi.fn(),
}));

// We do NOT mock isTauri — we control __TAURI_INTERNALS__ directly on window.

import {
  bakedOrigin,
  getServerOrigin,
  getServerOverride,
  setServerOverride,
  clearServerOverride,
} from "@/platform/server-config";
import { clearAuthToken } from "@/platform/auth-transport";
import { ServerOverride } from "@/components/server-override";

const mockedSetServerOverride = vi.mocked(setServerOverride);
const mockedClearServerOverride = vi.mocked(clearServerOverride);
const mockedClearAuthToken = vi.mocked(clearAuthToken);
const mockedGetServerOrigin = vi.mocked(getServerOrigin);
const mockedBakedOrigin = vi.mocked(bakedOrigin);

// Silence fetch-not-implemented warnings in jsdom
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetServerOrigin.mockReturnValue("https://arcan.example");
  mockedBakedOrigin.mockReturnValue("https://arcan.example");
  vi.mocked(getServerOverride).mockReturnValue(null);
});

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ---- helpers ----

function withTauri() {
  (window as any).__TAURI_INTERNALS__ = {};
}

function mockFetchOk() {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
}

function mockFetchFail() {
  globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("network error"));
}

// ---- tests ----

describe("ServerOverride — without Tauri", () => {
  it("renders null in a plain browser environment", () => {
    // __TAURI_INTERNALS__ is absent (afterEach deletes it)
    const { container } = render(<ServerOverride />);
    expect(container.firstChild).toBeNull();
  });
});

describe("ServerOverride — with Tauri stubbed", () => {
  beforeEach(() => {
    withTauri();
  });

  it("renders the trigger showing the baked host", () => {
    render(<ServerOverride />);
    const trigger = screen.getByTestId("server-override-trigger");
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain("arcan.example");
  });

  it("clicking the trigger opens the dialog", async () => {
    render(<ServerOverride />);
    expect(screen.queryByTestId("server-override-input")).toBeNull();
    fireEvent.click(screen.getByTestId("server-override-trigger"));
    expect(screen.getByTestId("server-override-input")).toBeTruthy();
  });

  it("dialog has save and reset buttons", () => {
    render(<ServerOverride />);
    fireEvent.click(screen.getByTestId("server-override-trigger"));
    expect(screen.getByTestId("server-override-save")).toBeTruthy();
    expect(screen.getByTestId("server-override-reset")).toBeTruthy();
  });
});

describe("ServerOverride — invalid input (http://)", () => {
  beforeEach(() => {
    withTauri();
    // setServerOverride throws a user-facing message for http://
    mockedSetServerOverride.mockImplementation((raw) => {
      if (!raw.startsWith("https://")) {
        throw new Error("Server must be reachable over https://");
      }
    });
  });

  it("shows setServerOverride's error message; does not reload", async () => {
    const assignSpy = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign: assignSpy,
    });

    render(<ServerOverride />);
    fireEvent.click(screen.getByTestId("server-override-trigger"));

    // type an http:// URL
    const input = screen.getByTestId("server-override-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "http://insecure.example" } });
    fireEvent.click(screen.getByTestId("server-override-save"));

    await waitFor(() =>
      expect(screen.queryByTestId("server-override-error")).toBeTruthy(),
    );
    const errorEl = screen.getByTestId("server-override-error");
    expect(errorEl.textContent).toContain("https://");
    expect(assignSpy).not.toHaveBeenCalled();
    expect(mockedClearAuthToken).not.toHaveBeenCalled();
  });
});

describe("ServerOverride — happy path (valid https + reachable)", () => {
  beforeEach(() => {
    withTauri();
    mockedSetServerOverride.mockImplementation(() => {
      /* success — no throw */
    });
    mockFetchOk();
  });

  it("calls setServerOverride, clearAuthToken, and location.assign('/') on save", async () => {
    const assignSpy = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign: assignSpy,
    });

    render(<ServerOverride />);
    fireEvent.click(screen.getByTestId("server-override-trigger"));

    const input = screen.getByTestId("server-override-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://chat.example.com" } });
    fireEvent.click(screen.getByTestId("server-override-save"));

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/"));
    expect(mockedSetServerOverride).toHaveBeenCalledWith("https://chat.example.com");
    expect(mockedClearAuthToken).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("server-override-error")).toBeNull();
  });

  it("disables buttons while checking (shows 'checking…')", async () => {
    // Make fetch hang so we can inspect the checking state
    let resolveFetch!: () => void;
    globalThis.fetch = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = () => resolve(new Response("ok", { status: 200 }));
      }),
    );

    const assignSpy = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign: assignSpy,
    });

    render(<ServerOverride />);
    fireEvent.click(screen.getByTestId("server-override-trigger"));
    const input = screen.getByTestId("server-override-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://chat.example.com" } });
    fireEvent.click(screen.getByTestId("server-override-save"));

    // While fetch is pending, the save button text changes to "checking…"
    await waitFor(() =>
      expect(screen.getByTestId("server-override-save").textContent).toContain("checking"),
    );
    expect((screen.getByTestId("server-override-save") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("server-override-reset") as HTMLButtonElement).disabled).toBe(true);

    // Resolve fetch and confirm navigation fires
    resolveFetch();
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/"));
  });
});

describe("ServerOverride — reset to default", () => {
  beforeEach(() => {
    withTauri();
    mockFetchOk();
  });

  it("calls clearServerOverride, clearAuthToken, and location.assign('/') on reset", async () => {
    const assignSpy = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign: assignSpy,
    });

    render(<ServerOverride />);
    fireEvent.click(screen.getByTestId("server-override-trigger"));
    fireEvent.click(screen.getByTestId("server-override-reset"));

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/"));
    expect(mockedClearServerOverride).toHaveBeenCalledOnce();
    expect(mockedClearAuthToken).toHaveBeenCalledOnce();
    expect(mockedSetServerOverride).not.toHaveBeenCalled();
  });
});
