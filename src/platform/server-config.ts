import { isTauri } from "./is-tauri";

/**
 * ServerConfig — where "the server" lives.
 *
 * Web: always the page's own origin (the SPA is served by its server;
 * overrides make no sense and are ignored).
 *
 * Tauri shell: baked default from VITE_ARCAN_ORIGIN, overridable at runtime
 * from the login screen (persisted in localStorage). Everything derives
 * from this one origin: sync WebSocket, auth API base, invite-link origin.
 */
export const SERVER_OVERRIDE_KEY = "arcan-server-origin";

/** Build-time baked origin for shell builds. Placeholder until the real
 * domain is supplied via env at build time. */
export function bakedOrigin(): string {
  return import.meta.env.VITE_ARCAN_ORIGIN || "https://arcan.example";
}

export function getServerOverride(): string | null {
  try {
    return localStorage.getItem(SERVER_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

/** Validates and normalizes to the https origin; throws user-facing errors on invalid input or storage failure. */
export function setServerOverride(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Enter a full URL, e.g. https://chat.example.com");
  }
  if (url.protocol !== "https:") {
    throw new Error("Server must be reachable over https://");
  }
  try {
    localStorage.setItem(SERVER_OVERRIDE_KEY, url.origin);
  } catch {
    throw new Error("Couldn't save the server address — storage is unavailable.");
  }
}

export function clearServerOverride(): void {
  try {
    localStorage.removeItem(SERVER_OVERRIDE_KEY);
  } catch {
    /* ignore */
  }
}

export function getServerOrigin(): string {
  if (!isTauri()) {
    return typeof window === "undefined"
      ? "http://localhost:5173"
      : window.location.origin;
  }
  return getServerOverride() ?? bakedOrigin();
}

/**
 * The WebSocket sync URL. Priority:
 * 1. VITE_SYNC_URL (explicit dev/build override — unchanged behavior)
 * 2. derived from getServerOrigin(): wss for https, ws for http
 */
export function deriveSyncUrl(): `ws://${string}` | `wss://${string}` {
  const envUrl = import.meta.env.VITE_SYNC_URL || undefined;
  if (envUrl) return envUrl as `ws://${string}` | `wss://${string}`;
  const origin = new URL(getServerOrigin());
  const proto = origin.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${origin.host}/sync/`;
}
