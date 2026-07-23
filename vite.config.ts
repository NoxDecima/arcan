import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Parse the unified ALLOWED_ORIGINS env var into Vite's server.allowedHosts
 * shape. Same env var is consumed by Better Auth (via auth-server.sh).
 *
 * Accepts both full origins ("https://host:port/path") and bare hostnames
 * ("host", ".host", "*.host"). Schemes + paths are stripped so we end up
 * with just the hostname that Vite expects.
 *
 *   ALLOWED_ORIGINS=https://nox-work.tail06a0b7.ts.net    # one origin
 *   ALLOWED_ORIGINS=host-a.ts.net,host-b.ts.net           # multiple
 *   ALLOWED_ORIGINS=.tail06a0b7.ts.net                    # subdomain glob
 *   ALLOWED_ORIGINS=*                                     # allow any
 *   (unset)                                               # Vite default
 *
 * Legacy fallback: VITE_ALLOWED_HOSTS is also honored if ALLOWED_ORIGINS
 * isn't set, for callers that adopted the older name.
 */
function parseAllowedHosts(): string[] | true | undefined {
  const raw = process.env.ALLOWED_ORIGINS ?? process.env.VITE_ALLOWED_HOSTS;
  if (!raw) return undefined;
  if (raw.trim() === "*") return true;
  const hosts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      // Strip "scheme://" prefix and any "/path" / "?query" tail so we
      // end up with the bare hostname. Works for full origins, bare
      // hosts, and subdomain globs ("*.foo", ".foo") alike.
      let host = entry;
      const schemeIdx = host.indexOf("://");
      if (schemeIdx !== -1) host = host.slice(schemeIdx + 3);
      host = host.split("/")[0].split("?")[0];
      return host;
    });
  return hosts.length > 0 ? hosts : undefined;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // DEV: pre-bundle the jazz WASM crypto dep so Vite never re-discovers and
  // rebundles it mid-run (the optimizer restart that causes the intermittent
  // WASM 404 → JazzReactProvider "Loading…" stall in dev/test environments).
  // `include` locks these into the initial optimized bundle; `needsInterop`
  // is not required because cojson-core-wasm is a plain ESM package.
  // Production is unaffected: optimizeDeps applies only to the dev server.
  optimizeDeps: {
    include: ["cojson-core-wasm", "cojson > cojson/crypto/WasmCrypto"],
  },
  server: {
    // Tauri mobile dev: `tauri android dev --host <ip>` sets TAURI_DEV_HOST so
    // the phone's webview can reach this dev server over the network.
    // Unset (normal web dev) → Vite's default localhost-only binding.
    host: process.env.TAURI_DEV_HOST,
    allowedHosts: parseAllowedHosts(),
    proxy: {
      // All /api/* routes: dev auth-server runs on :4300. Proxied as a
      // single prefix so the browser sees same-origin cookies (Better Auth
      // requires that). Previously "/api/auth" only — feedback + future
      // routes 404'd at Vite (user decision, 2026-07-05 walkthrough).
      "/api": "http://localhost:4300",
      // Jazz sync WebSocket: dev sync server runs on :4200.
      "/sync": { target: "ws://localhost:4200", ws: true },
    },
  },
});
