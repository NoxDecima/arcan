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
 * Singleton Better Auth client. The browser sends cookies automatically;
 * baseURL is relative so Caddy routes /api/auth/* to the auth-server.
 */
export const authClient = createAuthClient({
  baseURL: "/api/auth",
  plugins: [jazzZkPluginClient()],
});

export type AuthClient = typeof authClient;
