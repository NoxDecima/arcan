/**
 * ServerOverride component tests.
 *
 * The component is shell-only: isTauri() gates the whole render.
 * We stub __TAURI_INTERNALS__ to exercise the Tauri branch.
 *
 * Module mocking strategy: use vi.importActual for validateServerOrigin and
 * bakedOrigin so the real validation logic runs in tests (no stale mock
 * approximation). Only the persistence functions (setServerOverride,
 * clearServerOverride) and read helpers (getServerOrigin, getServerOverride)
 * are mocked — these touch localStorage and have no meaningful unit value here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ----- module mocks -----

// server-config: use importActual for pure functions (validateServerOrigin,
// bakedOrigin) so real validation runs; stub only persistence + read helpers.
vi.mock("@/platform/server-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/server-config")>();
  return {
    ...actual,
    // Keep real: validateServerOrigin, bakedOrigin (pure, no side effects)
    // Stub: stateful / storage-touching functions
    getServerOrigin: vi.fn(() => "https://arcan.example"),
    getServerOverride: vi.fn(() => null),
    setServerOverride: vi.fn(),
    clearServerOverride: vi.fn(),
  };
});

vi.mock("@/platform/auth-transport", () => ({
  clearAuthToken: vi.fn(),
}));

// We do NOT mock isTauri — we control __TAURI_INTERNALS__ directly on window.

import {
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

// Silence fetch-not-implemented warnings in jsdom
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetServerOrigin.mockReturnValue("https://arcan.example");
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

  it("input has aria-label 'Server URL'", () => {
    render(<ServerOverride />);
    fireEvent.click(screen.getByTestId("server-override-trigger"));
    const input = screen.getByTestId("server-override-input");
    expect(input.getAttribute("aria-label")).toBe("Server URL");
  });

  it("closing the dialog clears the error", async () => {
    withTauri();
    mockFetchFail();
    render(<ServerOverride />);
    fireEvent.click(screen.getByTestId("server-override-trigger"));

    const input = screen.getByTestId("server-override-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://unreachable.example" } });
    fireEvent.click(screen.getByTestId("server-override-save"));

    await waitFor(() =>
      expect(screen.queryByTestId("server-override-error")).toBeTruthy(),
    );

    // Close the dialog — error should clear on reopen
    const modal = screen.getByRole("dialog");
    // Simulate close by firing the onClose; ModalShell renders a close button
    // or we can click outside. For simplicity, reopen and check error gone.
    // Instead: close via the dialog close mechanism. The ModalShell uses onClose prop.
    // We find the close button rendered by ModalShell or trigger re-open.
    // Trigger: click the trigger button (which closes the modal via open=false → onClose).
    // Actually the trigger button only opens. We must call onClose another way.
    // The cleanest way: re-render with open=false isn't possible. Use the close button if it exists.
    const closeBtn = modal.querySelector("[aria-label='Close']") ?? modal.querySelector("button[data-dismiss]");
    if (closeBtn) {
      fireEvent.click(closeBtn);
    } else {
      // Fallback: the ModalShell likely renders a close button — look for one not matching save/reset
      const allButtons = Array.from(modal.querySelectorAll("button"));
      const nonActionBtn = allButtons.find(
        (b) =>
          b.getAttribute("data-testid") !== "server-override-save" &&
          b.getAttribute("data-testid") !== "server-override-reset",
      );
      if (nonActionBtn) fireEvent.click(nonActionBtn);
    }

    // Reopen and verify error is gone
    fireEvent.click(screen.getByTestId("server-override-trigger"));
    expect(screen.queryByTestId("server-override-error")).toBeNull();
  });
});

describe("ServerOverride — invalid input (http://)", () => {
  beforeEach(() => {
    withTauri();
    // fetch must NOT be called for validation errors (probe step never reached)
    globalThis.fetch = vi.fn();
  });

  it("shows validateServerOrigin's error message for http://; does not persist or reload", async () => {
    const assignSpy = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign: assignSpy,
    });

    render(<ServerOverride />);
    fireEvent.click(screen.getByTestId("server-override-trigger"));

    // type an http:// URL — real validateServerOrigin throws "Server must be reachable over https://"
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
    // Nothing persisted: neither setter called
    expect(mockedSetServerOverride).not.toHaveBeenCalled();
    expect(mockedClearServerOverride).not.toHaveBeenCalled();
    // Probe was never reached
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("shows the full-URL error message for a non-URL string", async () => {
    const assignSpy = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign: assignSpy,
    });

    render(<ServerOverride />);
    fireEvent.click(screen.getByTestId("server-override-trigger"));

    const input = screen.getByTestId("server-override-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "not a url" } });
    fireEvent.click(screen.getByTestId("server-override-save"));

    await waitFor(() =>
      expect(screen.queryByTestId("server-override-error")).toBeTruthy(),
    );
    const errorEl = screen.getByTestId("server-override-error");
    expect(errorEl.textContent).toContain("full URL");
    expect(assignSpy).not.toHaveBeenCalled();
    expect(mockedSetServerOverride).not.toHaveBeenCalled();
    expect(mockedClearServerOverride).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
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

describe("ServerOverride — unreachable server: friendly error, nothing persisted", () => {
  beforeEach(() => {
    withTauri();
    mockFetchFail();
  });

  it("shows the exact friendly copy text; location.assign not called; nothing persisted", async () => {
    vi.mocked(getServerOverride).mockReturnValue(null);

    const assignSpy = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign: assignSpy,
    });

    render(<ServerOverride />);
    fireEvent.click(screen.getByTestId("server-override-trigger"));

    const input = screen.getByTestId("server-override-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://unreachable.example" } });
    fireEvent.click(screen.getByTestId("server-override-save"));

    await waitFor(() =>
      expect(screen.queryByTestId("server-override-error")).toBeTruthy(),
    );

    // Exact friendly copy (not a raw fetch TypeError)
    expect(screen.getByTestId("server-override-error").textContent).toBe(
      "Could not reach that server. Check the address and try again.",
    );
    // Navigation must NOT have happened
    expect(assignSpy).not.toHaveBeenCalled();
    // Nothing persisted — neither setter was called
    expect(mockedSetServerOverride).not.toHaveBeenCalled();
    expect(mockedClearServerOverride).not.toHaveBeenCalled();
  });

  it("probe fail on reset — friendly error shown; nothing persisted", async () => {
    const assignSpy = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign: assignSpy,
    });

    render(<ServerOverride />);
    fireEvent.click(screen.getByTestId("server-override-trigger"));
    fireEvent.click(screen.getByTestId("server-override-reset"));

    await waitFor(() =>
      expect(screen.queryByTestId("server-override-error")).toBeTruthy(),
    );
    expect(screen.getByTestId("server-override-error").textContent).toBe(
      "Could not reach that server. Check the address and try again.",
    );
    expect(assignSpy).not.toHaveBeenCalled();
    expect(mockedSetServerOverride).not.toHaveBeenCalled();
    expect(mockedClearServerOverride).not.toHaveBeenCalled();
  });
});

describe("ServerOverride — storage failure after probe succeeds", () => {
  beforeEach(() => {
    withTauri();
    mockFetchOk();
  });

  it("setServerOverride throws storage message → that message rendered; location.assign not called", async () => {
    mockedSetServerOverride.mockImplementation(() => {
      throw new Error("Couldn't save the server address — storage is unavailable.");
    });

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

    await waitFor(() =>
      expect(screen.queryByTestId("server-override-error")).toBeTruthy(),
    );

    expect(screen.getByTestId("server-override-error").textContent).toContain(
      "storage is unavailable",
    );
    expect(assignSpy).not.toHaveBeenCalled();
    expect(mockedClearAuthToken).not.toHaveBeenCalled();
  });
});
