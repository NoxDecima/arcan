import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Parse the VITE_ALLOWED_HOSTS env var into Vite's server.allowedHosts
 * shape. Lets `scripts/dev-all.sh` (or any caller) expand the default
 * localhost-only host allowlist without hardcoding tailnet names.
 *
 *   VITE_ALLOWED_HOSTS=nox-work.tail06a0b7.ts.net         # one host
 *   VITE_ALLOWED_HOSTS=host-a.ts.net,host-b.ts.net        # multiple
 *   VITE_ALLOWED_HOSTS=.tail06a0b7.ts.net                 # whole tailnet
 *   VITE_ALLOWED_HOSTS=*                                  # allow any
 *   (unset)                                               # Vite default
 */
function parseAllowedHosts(): string[] | true | undefined {
  const raw = process.env.VITE_ALLOWED_HOSTS;
  if (!raw) return undefined;
  if (raw.trim() === "*") return true;
  const hosts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : undefined;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    allowedHosts: parseAllowedHosts(),
    proxy: {
      // Better Auth router: dev auth-server runs on :4300, proxied so
      // the browser sees same-origin cookies (Better Auth requires that).
      "/api/auth": "http://localhost:4300",
      // Jazz sync WebSocket: dev sync server runs on :4200.
      "/sync": { target: "ws://localhost:4200", ws: true },
    },
  },
});
