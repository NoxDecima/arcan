import { createAuthClient } from "better-auth/client";

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
 * Singleton Better Auth client. The browser sends cookies automatically.
 *
 * No explicit `baseURL` is passed: Better Auth 1.6's createAuthClient
 * derives it from `window.location.origin` and appends `/api/auth`, which
 * is exactly what we want for the production deploy (Caddy routes
 * /api/auth/* on the same domain to the auth-server). For local dev the
 * Vite dev server proxies /api/auth/* to localhost:4300 via
 * vite.config.ts.
 *
 * Passing a relative path like "/api/auth" as baseURL would throw
 * "Invalid base URL" because BA's URL parser requires an absolute origin.
 */
export const authClient = createAuthClient({
  plugins: [jazzZkPluginClient()],
});

export type AuthClient = typeof authClient;
