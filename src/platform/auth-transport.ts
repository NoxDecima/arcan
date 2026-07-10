import { isTauri } from "./is-tauri";
import { getServerOrigin } from "./server-config";

/**
 * Bearer-token session transport for Tauri shells.
 *
 * Web keeps HTTP-only cookies (XSS-immune, zero migration) — authFetch is a
 * plain fetch there. In the shell (origin https://tauri.localhost) cookies
 * don't survive, so the api server's better-auth `bearer` plugin issues a
 * session token via the `set-auth-token` response header; we persist it and
 * attach `Authorization: Bearer` on every auth/feedback request.
 * The token is bound to the origin that issued it; a server override or
 * foreign URL never sees it.
 * See docs/superpowers/specs/2026-07-09-android-tauri-app-design.md §Auth.
 */
export const AUTH_TOKEN_KEY = "arcan-auth-token";

interface StoredToken {
  origin: string;
  token: string;
}

export function getAuthToken(origin: string = getServerOrigin()): string | null {
  try {
    const raw = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!raw) return null;
    // Tolerate legacy plain-string values by treating them as origin-mismatched.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as StoredToken).origin !== "string" ||
      typeof (parsed as StoredToken).token !== "string"
    ) {
      return null;
    }
    const stored = parsed as StoredToken;
    return stored.origin === origin ? stored.token : null;
  } catch {
    return null;
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function captureToken(response: Response, origin: string): void {
  const token = response.headers.get("set-auth-token");
  if (token) {
    try {
      const stored: StoredToken = { origin, token };
      localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify(stored));
    } catch {
      /* a failed persist only costs a re-login next launch */
    }
  }
}

/**
 * Drop-in replacement for fetch() on /api/* paths. On web it IS fetch().
 */
export async function authFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!isTauri()) return fetch(input, init);

  const serverOrigin = getServerOrigin();
  const url = new URL(input, serverOrigin).href;
  const targetOrigin = new URL(input, serverOrigin).origin;

  const headers = new Headers(init.headers);
  // Only attach the bearer token when the request targets the configured server origin.
  if (targetOrigin === serverOrigin) {
    const token = getAuthToken(serverOrigin);
    if (token) headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, { ...init, headers });
  captureToken(response, serverOrigin);
  return response;
}
