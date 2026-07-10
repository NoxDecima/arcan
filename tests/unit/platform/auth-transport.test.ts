import { describe, it, expect, afterEach, vi } from "vitest";
import {
  authFetch,
  getAuthToken,
  clearAuthToken,
  AUTH_TOKEN_KEY,
} from "@/platform/auth-transport";

function enterTauri() {
  (window as any).__TAURI_INTERNALS__ = {};
}

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("authFetch on web", () => {
  it("passes through untouched (relative URL, no auth header)", async () => {
    const spy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", spy);
    await authFetch("/api/auth/sign-in/email", { method: "POST" });
    expect(spy).toHaveBeenCalledWith("/api/auth/sign-in/email", { method: "POST" });
  });
});

describe("authFetch in the shell", () => {
  it("prefixes the server origin and attaches the bearer token", async () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    localStorage.setItem(AUTH_TOKEN_KEY, "tok-123");
    const spy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", spy);

    await authFetch("/api/auth/me/auth-material", { method: "GET" });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://chat.meteory.eu/api/auth/me/auth-material");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok-123");
  });

  it("captures set-auth-token from responses", async () => {
    enterTauri();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { headers: { "set-auth-token": "fresh-tok" } })),
    );
    await authFetch("/api/auth/sign-in/email", { method: "POST" });
    expect(getAuthToken()).toBe("fresh-tok");
  });

  it("clearAuthToken removes the stored token", () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "tok");
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });
});
