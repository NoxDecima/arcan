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
 * See docs/superpowers/specs/2026-07-09-android-tauri-app-design.md §Auth.
 */
export const AUTH_TOKEN_KEY = "arcan-auth-token";

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
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

function captureToken(response: Response): void {
  const token = response.headers.get("set-auth-token");
  if (token) {
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
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

  const url = input.startsWith("/") ? `${getServerOrigin()}${input}` : input;
  const headers = new Headers(init.headers);
  const token = getAuthToken();
  if (token) headers.set("authorization", `Bearer ${token}`);

  const response = await fetch(url, { ...init, headers });
  captureToken(response);
  return response;
}
