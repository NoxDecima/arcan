import { createAuthClient } from "better-auth/client";
import { isTauri } from "@/platform/is-tauri";
import { getServerOrigin } from "@/platform/server-config";
import { authFetch } from "@/platform/auth-transport";

/**
 * Plugin-side client mirror of jazzZkPlugin. Exposes typed access to the
 * extra response fields (kdfSalt, encryptedSeed, accountID) and the
 * custom endpoints (/me/auth-material, /reset-with-recovery).
 *
 * Better Auth's plugin model wires this up by id-matching the server plugin.
 */
function jazzZkPluginClient() {
  return {
    id: "jazz-zk-plugin" as const,
  };
}

/**
 * Singleton Better Auth client.
 *
 * Web: no baseURL (derived from window.location.origin — unchanged). The
 * browser sends cookies automatically and no custom fetch is needed.
 *
 * Shell (https://tauri.localhost): cookies don't survive cross-origin
 * requests, so we give Better Auth an absolute baseURL pointing at the
 * configured server and swap in authFetch as the customFetchImpl so that
 * every auth call gets the bearer token attached and any `set-auth-token`
 * response header is captured.
 *
 * baseURL is computed at module load; correctness after a server-override
 * change relies on the full app reload that the override flow performs.
 *
 * Passing a relative path like "/api/auth" as baseURL would throw
 * "Invalid base URL" because BA's URL parser requires an absolute origin.
 * For local dev the Vite dev server proxies /api/auth/* to localhost:4300
 * via vite.config.ts (web path only; shell uses the explicit origin).
 */
export const authClient = createAuthClient({
  // Shell: absolute base against the configured server + bearer transport.
  ...(isTauri()
    ? {
        baseURL: `${getServerOrigin()}/api/auth`,
        fetchOptions: {
          // better-fetch passes string | URL | Request per the FetchEsque interface,
          // but in practice only ever passes string | URL — String(input) covers both.
          customFetchImpl: (input: string | URL | Request, init?: RequestInit) =>
            authFetch(String(input), init),
        },
      }
    : {}),
  plugins: [jazzZkPluginClient()],
});

export type AuthClient = typeof authClient;
