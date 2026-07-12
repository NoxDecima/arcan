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

  it("never attaches the token on web even when one is stored", async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify({ origin: window.location.origin, token: "tok" }));
    const spy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", spy);
    await authFetch("/api/auth/me/auth-material", {});
    expect(spy.mock.calls[0][1]).toEqual({});
  });
});

describe("authFetch in the shell", () => {
  it("prefixes the server origin and attaches the bearer token", async () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify({ origin: "https://chat.meteory.eu", token: "tok-123" }));
    const spy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", spy);

    await authFetch("/api/auth/me/auth-material", { method: "GET" });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://chat.meteory.eu/api/auth/me/auth-material");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok-123");
  });

  it("captures set-auth-token from responses", async () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { headers: { "set-auth-token": "fresh-tok" } })),
    );
    await authFetch("/api/auth/sign-in/email", { method: "POST" });
    expect(getAuthToken("https://chat.meteory.eu")).toBe("fresh-tok");
  });

  it("clearAuthToken removes the stored token", () => {
    localStorage.setItem(
      AUTH_TOKEN_KEY,
      JSON.stringify({ origin: window.location.origin, token: "tok" }),
    );
    expect(getAuthToken(window.location.origin)).toBe("tok");
    clearAuthToken();
    expect(getAuthToken(window.location.origin)).toBeNull();
  });

  it("does not capture a token from a foreign response", async () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    const foreign = new Response("{}", { headers: { "set-auth-token": "planted" } });
    Object.defineProperty(foreign, "url", { value: "https://evil.example/redirected" });
    vi.stubGlobal("fetch", vi.fn(async () => foreign));
    await authFetch("/api/auth/sign-in/email", { method: "POST" });
    expect(getAuthToken("https://chat.meteory.eu")).toBeNull();
  });

  it("attaches no header in the shell when no token is stored", async () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    const spy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", spy);
    await authFetch("/api/auth/me/auth-material", {});
    expect(new Headers(spy.mock.calls[0][1].headers).get("authorization")).toBeNull();
  });

  it("does not send the token to a foreign absolute URL in the shell", async () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify({ origin: "https://chat.meteory.eu", token: "tok-123" }));
    const spy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", spy);
    await authFetch("https://evil.example/steal", {});
    expect(spy.mock.calls[0][0]).toBe("https://evil.example/steal");
    expect(new Headers(spy.mock.calls[0][1]?.headers).get("authorization")).toBeNull();
  });

  it("ignores a token captured for a different origin", async () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify({ origin: "https://old.example", token: "stale" }));
    const spy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", spy);
    await authFetch("/api/auth/me/auth-material", {});
    expect(new Headers(spy.mock.calls[0][1].headers).get("authorization")).toBeNull();
  });
});
