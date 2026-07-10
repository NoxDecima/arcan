# Android App via Tauri 2 (Bundled Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Arcan as a signed Android APK: a Tauri 2 shell bundling the existing Vite/React/Jazz app, with native QR scanning, file pick/save, OS notifications, App Links, bearer auth, and a GitHub Releases distribution pipeline.

**Architecture:** The web app stays the single codebase. A new `src/platform/` layer is the only module that may import `@tauri-apps/*`; every capability has a web implementation (current behavior) and a Tauri implementation selected via `isTauri()`. Server endpoints derive from a `ServerConfig` (baked `VITE_ARCAN_ORIGIN` + login-screen override). The `api/` server additively accepts bearer tokens alongside cookies.

**Tech Stack:** Tauri 2 (`@tauri-apps/cli`, `api`, plugins: barcode-scanner, dialog, fs, notification, deep-link), better-auth `bearer` plugin, Hono `cors`, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-09-android-tauri-app-design.md`

**Branch:** all work on `worktree-android-tauri-spec` in this worktree. Commit per task.

---

## User-supplied values (blockers for on-device steps only, not for code)

| Value | Placeholder used in code | Who provides |
| --- | --- | --- |
| Deployed domain | `arcan.example` / `VITE_ARCAN_ORIGIN` | user (build-time env; also `tauri.conf.json` deep-link host) |
| Android app identifier | `eu.meteory.arcan` | user confirms or replaces |
| Release keystore + passwords | n/a (never committed) | user generates (Task 14 documents how) |
| GitHub repo (Releases) | n/a | user (CI publishes there) |

Code tasks use the placeholders; they are greppable (`arcan.example`) and swapped by env/config, not scattered.

---

## File structure (created/modified)

```
src/platform/is-tauri.ts                (new) feature detection
src/platform/server-config.ts           (new) origin/override/sync-url derivation
src/platform/auth-transport.ts          (new) bearer token store + authFetch
src/platform/notifications.ts           (new) notify/permission/channel adapter
src/platform/files.ts                   (new) pickFilesNative / saveBlobNative
src/platform/qr.ts                      (new) native barcode scan wrapper
src/platform/deep-link.ts               (new) parseIncomingUrl + init listener
src/components/server-override.tsx      (new) login-screen override dialog
src/components/deep-link-bridge.tsx     (new) App-mounted URL arrival handler
src/routes/diag.tsx                     (new) Phase-0 device diagnostics screen
src-tauri/**                            (new) Tauri crate
gen/android/**                          (generated, committed)
shell.android.nix                       (new) Android/Rust toolchain shell
scripts/check-platform-purity.sh        (new) @tauri-apps import guard
.github/workflows/android.yml           (new) CI build + release
deploy/assetlinks.json.example          (new) App Links template
docs/testing/android-device-checklist.md (new) release checklist

src/jazz/provider.tsx                   (mod) sync URL via server-config
src/auth/client.ts                      (mod) baseURL + customFetchImpl in shell
src/auth/flows.ts                       (mod) fetch → authFetch (4 sites)
src/routes/settings/feedback-route.tsx  (mod) fetch → authFetch; picker
src/components/notification-manager.tsx (mod) notify() adapter
src/routes/settings/index.tsx           (mod) permission adapter
src/qr/scanner.tsx                      (mod) native scan branch
src/components/attachment-tile.tsx      (mod) saveBlobNative
src/routes/onboarding/profile-step.tsx  (mod) picker
src/components/profile-view.tsx         (mod) picker
src/routes/conversations/detail.tsx     (mod) picker
src/routes/conversations/members.tsx    (mod) picker
src/routes/auth/login.tsx               (mod) server-override affordance
src/App.tsx                             (mod) DeepLinkBridge + diag route + channel init
package.json / .env.example / src/vite-env.d.ts / CLAUDE.md / deploy/README.md (mod)
```

---

### Task 1: `isTauri()` feature detection

**Files:**
- Create: `src/platform/is-tauri.ts`
- Test: `tests/unit/platform/is-tauri.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/platform/is-tauri.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { isTauri, isTauriAndroid } from "@/platform/is-tauri";

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
});

describe("isTauri", () => {
  it("is false in a plain browser environment", () => {
    expect(isTauri()).toBe(false);
  });

  it("is true when __TAURI_INTERNALS__ is present", () => {
    (window as any).__TAURI_INTERNALS__ = {};
    expect(isTauri()).toBe(true);
  });
});

describe("isTauriAndroid", () => {
  it("is false outside Tauri even on an Android UA", () => {
    expect(isTauriAndroid()).toBe(false);
  });

  it("is true inside Tauri with an Android UA", () => {
    (window as any).__TAURI_INTERNALS__ = {};
    const original = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36",
      configurable: true,
    });
    expect(isTauriAndroid()).toBe(true);
    Object.defineProperty(navigator, "userAgent", { value: original, configurable: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/platform/is-tauri.test.ts`
Expected: FAIL — cannot resolve `@/platform/is-tauri`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/platform/is-tauri.ts
/**
 * Platform detection for the Tauri shell.
 *
 * `__TAURI_INTERNALS__` is injected by the Tauri runtime into every webview
 * it hosts (v2). Its absence means we're a plain browser tab / PWA.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Android-specific shell detection — used where the capability only exists
 * on mobile (e.g. the native barcode-scanner plugin).
 */
export function isTauriAndroid(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/platform/is-tauri.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platform/is-tauri.ts tests/unit/platform/is-tauri.test.ts
git commit -m "feat(platform): isTauri/isTauriAndroid feature detection"
```

---

### Task 2: ServerConfig — origin, override, sync-URL derivation

**Files:**
- Create: `src/platform/server-config.ts`
- Modify: `src/jazz/provider.tsx:27-46` (SYNC_URL derivation)
- Modify: `.env.example` (document `VITE_ARCAN_ORIGIN`)
- Modify: `src/vite-env.d.ts` (typed env)
- Test: `tests/unit/platform/server-config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/platform/server-config.test.ts
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  getServerOrigin,
  getServerOverride,
  setServerOverride,
  clearServerOverride,
  deriveSyncUrl,
  SERVER_OVERRIDE_KEY,
} from "@/platform/server-config";

function enterTauri() {
  (window as any).__TAURI_INTERNALS__ = {};
}

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe("getServerOrigin", () => {
  it("returns window.location.origin on web, ignoring any override", () => {
    localStorage.setItem(SERVER_OVERRIDE_KEY, "https://other.example");
    expect(getServerOrigin()).toBe(window.location.origin);
  });

  it("returns the baked VITE_ARCAN_ORIGIN in the shell", () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    expect(getServerOrigin()).toBe("https://chat.meteory.eu");
  });

  it("prefers a stored override in the shell", () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    localStorage.setItem(SERVER_OVERRIDE_KEY, "https://other.example");
    expect(getServerOrigin()).toBe("https://other.example");
  });

  it("falls back to the placeholder origin in the shell when no env is baked", () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "");
    expect(getServerOrigin()).toBe("https://arcan.example");
  });
});

describe("setServerOverride", () => {
  it("persists a valid https origin (normalized, no trailing slash)", () => {
    enterTauri();
    setServerOverride("https://other.example/");
    expect(getServerOverride()).toBe("https://other.example");
  });

  it("rejects non-https origins", () => {
    enterTauri();
    expect(() => setServerOverride("http://insecure.example")).toThrow(/https/);
    expect(() => setServerOverride("not a url")).toThrow(/full URL/);
  });

  it("throws dialog-grade copy when storage writes fail", () => {
    enterTauri();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => setServerOverride("https://other.example")).toThrow(/storage is unavailable/);
    spy.mockRestore();
  });

  it("clearServerOverride removes the stored value", () => {
    enterTauri();
    setServerOverride("https://other.example");
    clearServerOverride();
    expect(getServerOverride()).toBeNull();
  });
});

describe("deriveSyncUrl", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SYNC_URL", "");
  });

  it("uses VITE_SYNC_URL verbatim when set", () => {
    vi.stubEnv("VITE_SYNC_URL", "ws://192.168.1.42:4200");
    expect(deriveSyncUrl()).toBe("ws://192.168.1.42:4200");
  });

  it("derives wss://<host>/sync/ from an https server origin in the shell", () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    expect(deriveSyncUrl()).toBe("wss://chat.meteory.eu/sync/");
  });

  it("derives from window.location on web (existing behavior)", () => {
    // jsdom default origin is http://localhost:3000
    expect(deriveSyncUrl()).toBe(`ws://${window.location.host}/sync/`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/platform/server-config.test.ts`
Expected: FAIL — cannot resolve `@/platform/server-config`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/platform/server-config.ts
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
  const envUrl = import.meta.env.VITE_SYNC_URL as
    | `ws://${string}`
    | `wss://${string}`
    | undefined;
  if (envUrl) return envUrl;
  const origin = new URL(getServerOrigin());
  const proto = origin.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${origin.host}/sync/`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/platform/server-config.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Rewire `src/jazz/provider.tsx`**

Replace the `SYNC_URL` block (keep `deriveDefaultSyncURL` exported — `tests/unit/jazz/provider.test.ts` tests it and it remains the web fallback inside `deriveSyncUrl`; verify that test still passes):

```typescript
// src/jazz/provider.tsx — replace lines 27-46 (deriveDefaultSyncURL + SYNC_URL)
import { deriveSyncUrl } from "@/platform/server-config";

/**
 * Web fallback: wss://<host>/sync/ from the page origin. Kept exported for
 * unit tests; the actual selection (env override, shell ServerConfig) lives
 * in @/platform/server-config.deriveSyncUrl.
 */
export function deriveDefaultSyncURL(): `ws://${string}` | `wss://${string}` {
  if (typeof window === "undefined") return "ws://localhost:4200";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/sync/`;
}

const SYNC_URL = deriveSyncUrl();
```

(Everything else in the file — `MessangerProvider`, JSX — unchanged.)

- [ ] **Step 6: Type the new env var**

Append to `src/vite-env.d.ts` (create the interface block if the file only has the `/// <reference types="vite/client" />` line):

```typescript
interface ImportMetaEnv {
  readonly VITE_SYNC_URL?: string;
  readonly VITE_ARCAN_ORIGIN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

Append to `.env.example`:

```bash
# Canonical server origin baked into Tauri shell builds (Android/desktop).
# The shell derives sync (wss://<host>/sync/), auth (/api/auth), and
# invite-link origins from this. Web builds ignore it.
# VITE_ARCAN_ORIGIN=https://chat.example.com
```

- [ ] **Step 7: Run full gates**

Run: `npm run typecheck && npx vitest run`
Expected: PASS, including the pre-existing `tests/unit/jazz/provider.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/platform/server-config.ts tests/unit/platform/server-config.test.ts src/jazz/provider.tsx src/vite-env.d.ts .env.example
git commit -m "feat(platform): ServerConfig — baked origin, override, sync-URL derivation"
```

---

### Task 3: Bearer auth transport (client side)

**Files:**
- Create: `src/platform/auth-transport.ts`
- Modify: `src/auth/client.ts:29-32`
- Modify: `src/auth/flows.ts` (4 fetch sites: lines ~66-85, ~127-132, ~182-193, ~206-209)
- Modify: `src/routes/settings/feedback-route.tsx` (the `/api/feedback` POST, ~line 54)
- Test: `tests/unit/platform/auth-transport.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/platform/auth-transport.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/platform/auth-transport.test.ts`
Expected: FAIL — cannot resolve `@/platform/auth-transport`.

- [ ] **Step 3: Write the implementation**

Token stored as JSON `{"origin": string, "token": string}` under `AUTH_TOKEN_KEY`.
`getAuthToken(origin)` returns the token only when the stored origin matches; legacy
plain-string values are treated as mismatched (forward-compat, no migration needed).
`authFetch` only attaches the Authorization header when the target URL's origin equals
`getServerOrigin()`; absolute foreign URLs pass through with no bearer header.

```typescript
// src/platform/auth-transport.ts — origin-bound shape (see actual file for full impl)
export const AUTH_TOKEN_KEY = "arcan-auth-token";
export function getAuthToken(origin: string = getServerOrigin()): string | null { … }
export function clearAuthToken(): void { … }
function captureToken(response: Response, origin: string): void { … } // stores {origin, token}
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!isTauri()) return fetch(input, init);
  const serverOrigin = getServerOrigin();
  const url = new URL(input, serverOrigin).href;
  const targetOrigin = new URL(input, serverOrigin).origin;
  const headers = new Headers(init.headers);
  if (targetOrigin === serverOrigin) {
    const token = getAuthToken(serverOrigin);
    if (token) headers.set("authorization", `Bearer ${token}`);
  }
  const response = await fetch(url, { ...init, headers });
  captureToken(response, serverOrigin);
  return response;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/platform/auth-transport.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Rewire callers**

`src/auth/flows.ts` — add `import { authFetch } from "@/platform/auth-transport";` and replace all four `fetch(` calls (`/api/auth/sign-up/email`, `/api/auth/sign-in/email`, `/api/auth/reset-with-recovery`, `/api/auth/me/auth-material`) with `authFetch(` — arguments unchanged (keeping `credentials: "include"` is harmless in the shell).

`src/routes/settings/feedback-route.tsx` — same: import `authFetch`, replace the `fetch("/api/feedback", …)` call with `authFetch("/api/feedback", …)`.

`src/routes/settings/index.tsx` — add `import { clearAuthToken } from "@/platform/auth-transport"` and call `clearAuthToken()` immediately after `authClient.signOut()` in `handleSignOut` (harmless on web; clears the bearer token in the shell).

`src/auth/client.ts` — make the better-auth client shell-aware:

```typescript
// src/auth/client.ts — replace the createAuthClient call (lines 29-32)
import { createAuthClient } from "better-auth/client";
import { isTauri } from "@/platform/is-tauri";
import { getServerOrigin } from "@/platform/server-config";
import { authFetch } from "@/platform/auth-transport";

// … jazzZkPluginClient unchanged …

export const authClient = createAuthClient({
  // Web: no baseURL (derived from window.location.origin — unchanged).
  // Shell: absolute base against the configured server + bearer transport.
  ...(isTauri()
    ? {
        baseURL: `${getServerOrigin()}/api/auth`,
        fetchOptions: {
          customFetchImpl: (input: string | URL | Request, init?: RequestInit) =>
            authFetch(String(input), init),
        },
      }
    : {}),
  plugins: [jazzZkPluginClient()],
});
```

- [ ] **Step 6: Run full gates**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/platform/auth-transport.ts tests/unit/platform/auth-transport.test.ts src/auth/flows.ts src/auth/client.ts src/routes/settings/feedback-route.tsx
git commit -m "feat(platform): bearer auth transport for shells; web keeps cookies"
```

---

### Task 4: Bearer + CORS on the api server

**Files:**
- Modify: `api/src/index.ts` (auth config + Hono middleware)
- Test: `api/src/bearer.test.ts` (place next to existing api tests if a different convention exists — check `api/src/*.test.ts` first and match it)

- [ ] **Step 1: Write the failing test**

```typescript
// api/src/bearer.test.ts
import { describe, it, expect } from "vitest";
import { SHELL_ORIGINS } from "./index.js";

describe("shell origins", () => {
  it("covers the Tauri https scheme (Android/Windows) and custom scheme (Linux)", () => {
    expect(SHELL_ORIGINS).toContain("https://tauri.localhost");
    expect(SHELL_ORIGINS).toContain("http://tauri.localhost");
    expect(SHELL_ORIGINS).toContain("tauri://localhost");
  });
});
```

Note: `api/src/index.ts` currently starts the HTTP server at import time
(`serve(...)` at module scope), so importing it in a test would bind a port.
**Check first**: if importing is disruptive, extract the constant into
`api/src/shell-origins.ts` and import from there in both places. Full
end-to-end bearer verification is a manual step (Step 4) because better-auth
needs its SQLite DB + migrations booted.

- [ ] **Step 2: Modify `api/src/index.ts`**

```typescript
// api/src/index.ts — additions (imports at top)
import { bearer } from "better-auth/plugins";
import { cors } from "hono/cors";

// Origins the Tauri shells run on. https://tauri.localhost is Android +
// Windows (useHttpsScheme: true); tauri://localhost is Linux/macOS webkit.
// http://tauri.localhost kept for safety if a build ships without the
// https scheme flag.
export const SHELL_ORIGINS = [
  "https://tauri.localhost",
  "http://tauri.localhost",
  "tauri://localhost",
];

// In authConfig, extend plugins and add trustedOrigins:
const authConfig = {
  // … existing fields unchanged …
  trustedOrigins: SHELL_ORIGINS,
  // Reject raw session tokens — only the signed token from set-auth-token authenticates.
  plugins: [jazzZkPlugin(), bearer({ requireSignature: true })],
};

// After `const app = new Hono();` and BEFORE the /api/auth/* handler:
app.use(
  "/api/*",
  cors({
    origin: SHELL_ORIGINS,
    allowHeaders: ["content-type", "authorization", "x-jazz-zk"],
    exposeHeaders: ["set-auth-token"],
    maxAge: 86400,
  }),
);
```

Three critical details:
- `exposeHeaders: ["set-auth-token"]` — without it the shell's JS cannot read the token header across origins and login silently fails.
- `trustedOrigins` — better-auth rejects POSTs whose Origin isn't trusted; the CORS layer alone is not enough.
- `bearer()` comes from `better-auth/plugins` (already a dependency, ^1.0.0 — if the import fails, bump `better-auth` in `api/package.json` to `^1.6.0` to match the root app and run `npm install` in `api/`).

- [ ] **Step 3: Run api tests + typecheck**

Run: `cd api && npm run build && npm test`
Expected: PASS (existing tests + the new one).

- [ ] **Step 4: Manual end-to-end bearer check (local)**

Run (repo root, three terminals or `npm run dev:all` variant):

```bash
npm run api          # auth server on :4300
# then:
curl -si -X POST http://localhost:4300/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -H 'origin: https://tauri.localhost' \
  -d '{"email":"<an existing dev account>","password":"<its password>"}' | grep -i 'set-auth-token\|access-control'
```

Expected: `access-control-allow-origin: https://tauri.localhost`, `access-control-expose-headers` containing `set-auth-token`, and a `set-auth-token:` header with a token. Then:

```bash
curl -si http://localhost:4300/api/auth/me/auth-material \
  -H 'origin: https://tauri.localhost' \
  -H 'authorization: Bearer <token from above>' | head -5
```

Expected: `200` with the auth-material JSON (not `401`).
If no dev account exists yet, create one first through the web UI (`npm run dev:all`, sign up at `http://localhost:5173`).

- [ ] **Step 5: Commit**

```bash
git add api/src/index.ts api/src/bearer.test.ts
git commit -m "feat(api): bearer plugin + shell-origin CORS (web cookie flow unchanged)"
```

---

### Task 5: Android/Rust toolchain nix shell

**Files:**
- Create: `shell.android.nix`

- [ ] **Step 1: Write the shell**

```nix
# shell.android.nix — toolchain for building the Tauri Android shell.
# Kept separate from shell.nix so the everyday web dev shell stays light.
#
# Enter with:  nix-shell shell.android.nix
# First time:  rustup default stable && rustup target add aarch64-linux-android \
#                armv7-linux-androideabi i686-linux-android x86_64-linux-android
#
# Unfree acceptance is handled in-file (config.allowUnfree below). Only if
# you pass your own pkgs must you set NIXPKGS_ALLOW_UNFREE=1 yourself.

{ pkgs ? import <nixpkgs> { config.android_sdk.accept_license = true; config.allowUnfree = true; } }:

let
  androidComposition = pkgs.androidenv.composeAndroidPackages {
    # These versions must exist in your channel's androidenv repo.json.
    platformVersions = [ "34" ];
    buildToolsVersions = [ "34.0.0" ];
    includeNDK = true;
    ndkVersions = [ "27.0.12077973" ];
    includeEmulator = false;
  };
in
pkgs.mkShell {
  name = "arcan-android";

  buildInputs = with pkgs; [
    nodejs_22
    git
    rustup
    jdk21
    androidComposition.androidsdk
    pkg-config
    openssl
  ];

  shellHook = ''
    export ANDROID_HOME=${androidComposition.androidsdk}/libexec/android-sdk
    export NDK_HOME=$ANDROID_HOME/ndk-bundle
    export JAVA_HOME=${pkgs.jdk21.home}

    # NixOS: Gradle/AGP's Maven-downloaded aapt2 is dynamically linked against
    # /lib64 and dies with "AAPT2 Daemon startup failed" — use the SDK's own.
    # Keep the build-tools version in sync with buildToolsVersions above.
    export GRADLE_OPTS="-Dorg.gradle.project.android.aapt2FromMavenOverride=$ANDROID_HOME/build-tools/34.0.0/aapt2"

    # Tauri reads NDK_HOME; cargo-ndk and other tooling read these aliases.
    export ANDROID_NDK_HOME=$NDK_HOME
    export ANDROID_NDK_ROOT=$NDK_HOME

    echo
    echo "arcan android shell"
    echo "  ANDROID_HOME: $ANDROID_HOME"
    echo "  NDK_HOME:     $NDK_HOME"
    echo "  rustup:       $(rustup --version 2>/dev/null || echo 'run: rustup default stable')"
    echo
    echo "Dev:    npm run tauri android dev     (physical device via adb; no emulator composed)"
    echo "Build:  npm run tauri android build -- --apk"
    echo
  '';
}
```

- [ ] **Step 2: Verify the shell evaluates**

Run: `nix-shell shell.android.nix --run 'echo ANDROID_HOME=$ANDROID_HOME && java -version 2>&1 | head -1'`
Expected: prints an ANDROID_HOME path in the nix store and a JDK 21 version line. (First run downloads the SDK — several GB; if the sandbox forbids that, mark this step "verified by user" and continue.)

- [ ] **Step 3: Commit**

```bash
git add shell.android.nix
git commit -m "chore(android): nix shell with Android SDK/NDK + Rust toolchain"
```

---

### Task 6: Tauri scaffold (`src-tauri/`)

**Files:**
- Create: `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/build.rs`, `src-tauri/.gitignore`, `src-tauri/icons/*`
- Modify: `package.json` (deps + scripts)

- [ ] **Step 1: Add npm dependencies and scripts**

Run:

```bash
npm install --save-exact @tauri-apps/api@^2 @tauri-apps/plugin-barcode-scanner@^2 @tauri-apps/plugin-dialog@^2 @tauri-apps/plugin-fs@^2 @tauri-apps/plugin-notification@^2 @tauri-apps/plugin-deep-link@^2
npm install --save-dev @tauri-apps/cli@^2
```

Add to `package.json` scripts:

```json
"tauri": "tauri",
"android:dev": "tauri android dev",
"android:build": "tauri android build -- --apk"
```

- [ ] **Step 2: Create the crate**

```toml
# src-tauri/Cargo.toml
[package]
name = "arcan"
version = "0.1.0"
description = "Arcan — local-first E2EE messenger (Tauri shell)"
edition = "2021"

[lib]
name = "arcan_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-notification = "2"
tauri-plugin-deep-link = "2"

[target.'cfg(any(target_os = "android", target_os = "ios"))'.dependencies]
tauri-plugin-barcode-scanner = "2"
```

```rust
// src-tauri/build.rs
fn main() {
    tauri_build::build()
}
```

```rust
// src-tauri/src/lib.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running arcan");
}
```

```rust
// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    arcan_lib::run()
}
```

```json
// src-tauri/tauri.conf.json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Arcan",
  "version": "../package.json",
  "identifier": "eu.meteory.arcan",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Arcan",
        "useHttpsScheme": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "plugins": {
    "deep-link": {
      "mobile": [
        {
          "host": "arcan.example",
          "pathPrefix": ["/invite", "/pair"]
        }
      ]
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

`useHttpsScheme: true` is the permanent day-one decision from the spec (switching later wipes IndexedDB). The deep-link `host` is the placeholder; swap for the real domain together with `VITE_ARCAN_ORIGIN`. `"version": "../package.json"` derives versionName/versionCode from the root package.json (spec §Packaging) — bump that version when tagging releases (it's `0.0.0` today; set it to `0.1.0` as part of the first release tag).

```gitignore
# src-tauri/.gitignore
/target/
/gen/schemas
```

```json
// src-tauri/capabilities/default.json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Arcan shell capabilities",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "fs:default",
    "fs:allow-read-file",
    "fs:allow-write-file",
    "notification:default",
    "deep-link:default"
  ],
  "platforms": ["linux", "macOS", "windows", "android", "iOS"]
}
```

Standing fs scopes are unnecessary — the dialog plugin auto-scopes user-picked paths; commands stay enabled via allow-read-file/allow-write-file.

```json
// src-tauri/capabilities/mobile.json
{
  "$schema": "../gen/schemas/mobile-schema.json",
  "identifier": "mobile",
  "description": "Android/iOS-only capabilities (native QR scanner)",
  "windows": ["main"],
  "permissions": [
    "barcode-scanner:allow-scan",
    "barcode-scanner:allow-cancel",
    "barcode-scanner:allow-check-permissions",
    "barcode-scanner:allow-request-permissions"
  ],
  "platforms": ["android", "iOS"]
}
```

- [ ] **Step 3: Generate icons**

Run: `npx tauri icon public/favicon.svg` (check `public/` for the actual brand SVG name first; `ls public/`). If the CLI rejects SVG input, rasterize first: `npx svgexport public/favicon.svg /tmp/icon-1024.png 1024:1024 && npx tauri icon /tmp/icon-1024.png`.
Expected: `src-tauri/icons/` populated (32x32.png, 128x128.png, icon.ico, icon.icns, android densities).

- [ ] **Step 4: Verify the crate compiles and the web build still passes**

Run: `cd src-tauri && cargo check` (inside `nix-shell shell.android.nix` — rustup stable must be installed; if the environment can't compile Rust, defer compile verification to CI in Task 14 and note it).
Run: `npm run build && npm run typecheck && npx vitest run`
Expected: web gates PASS regardless of cargo availability.

- [ ] **Step 5: Commit**

```bash
git add src-tauri package.json package-lock.json
git commit -m "feat(android): Tauri 2 crate scaffold — useHttpsScheme, plugins, capabilities"
```

---

### Task 7: Android project init + Phase-0 diagnostics screen

**Files:**
- Create: `gen/android/**` (generated by CLI, committed)
- Create: `src/routes/diag.tsx`
- Modify: `src/App.tsx` (register `/diag` route in the route table)

- [ ] **Step 1: Initialize the Android project**

Run (inside `nix-shell shell.android.nix`): `npx tauri android init`
Expected: `gen/android/` Gradle project generated referencing identifier `eu.meteory.arcan`. If the toolchain isn't available in this environment, this step moves to the user/CI — do NOT fake the directory by hand; continue with Step 2 (pure web code) and flag it.

- [ ] **Step 2: Write the diagnostics screen (Phase-0 smoke, permanent utility)**

```tsx
// src/routes/diag.tsx
import { useEffect, useState } from "react";
import { deriveSyncUrl, getServerOrigin } from "@/platform/server-config";
import { isTauri, isTauriAndroid } from "@/platform/is-tauri";

type CheckState = "pending" | "pass" | "fail";
interface Check {
  label: string;
  state: CheckState;
  detail?: string;
}

/**
 * /diag — device diagnostics for shell builds (spec: Phase 0).
 * Verifies the load-bearing platform assumptions: secure context,
 * WebCrypto, WASM, IndexedDB persistence, and sync-server reachability.
 * Reachable by URL only (not linked from the UI).
 */
export function DiagRoute() {
  const [checks, setChecks] = useState<Check[]>([]);

  useEffect(() => {
    let alive = true;
    async function run() {
      const results: Check[] = [];

      // Push a completed check live so results appear incrementally rather
      // than all-at-once after the slowest check (WS 5 s timeout) resolves.
      // A wedged check therefore cannot blank the screen for earlier results.
      function report(check: Check) {
        results.push(check);
        if (alive) setChecks([...results]);
      }

      report({
        label: "environment",
        state: "pass",
        detail: `origin=${window.location.origin} tauri=${isTauri()} android=${isTauriAndroid()}`,
      });

      report({
        label: "secure context",
        state: window.isSecureContext ? "pass" : "fail",
      });

      report({
        label: "WebCrypto (crypto.subtle)",
        state: typeof crypto?.subtle?.digest === "function" ? "pass" : "fail",
      });

      try {
        // Argon2id via hash-wasm is the real dependency — exercise WASM.
        const { argon2id } = await import("hash-wasm");
        const hash = await argon2id({
          password: "diag",
          salt: new Uint8Array(16),
          parallelism: 1,
          iterations: 1,
          memorySize: 1024,
          hashLength: 16,
          outputType: "hex",
        });
        report({ label: "WASM (hash-wasm argon2id)", state: hash.length === 32 ? "pass" : "fail" });
      } catch (e) {
        report({ label: "WASM (hash-wasm argon2id)", state: "fail", detail: String(e) });
      }

      try {
        // 5 s timeout so a wedged IDB reports FAIL instead of hanging forever.
        await Promise.race([
          new Promise<void>((resolve, reject) => {
            const req = indexedDB.open("arcan-diag", 1);
            req.onupgradeneeded = () => req.result.createObjectStore("kv");
            req.onsuccess = () => {
              try {
                const db = req.result;
                const tx = db.transaction("kv", "readwrite");
                tx.objectStore("kv").put(Date.now(), "probe");
                tx.oncomplete = () => {
                  db.close();
                  // Fire-and-forget: clean up the probe DB so it doesn't linger.
                  indexedDB.deleteDatabase("arcan-diag");
                  resolve();
                };
                tx.onerror = () => reject(tx.error);
              } catch (e) {
                reject(e);
              }
            };
            req.onerror = () => reject(req.error);
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("IndexedDB open timed out after 5 s")), 5000)
          ),
        ]);
        report({ label: "IndexedDB write", state: "pass" });
      } catch (e) {
        report({ label: "IndexedDB write", state: "fail", detail: String(e) });
      }

      const syncUrl = deriveSyncUrl();
      const wsResult = await new Promise<Check>((resolve) => {
        try {
          const ws = new WebSocket(syncUrl);
          const timer = setTimeout(() => {
            ws.close();
            resolve({ label: "sync WebSocket", state: "fail", detail: `timeout: ${syncUrl}` });
          }, 5000);
          ws.onopen = () => {
            clearTimeout(timer);
            ws.close();
            resolve({ label: "sync WebSocket", state: "pass", detail: syncUrl });
          };
          ws.onerror = () => {
            clearTimeout(timer);
            resolve({ label: "sync WebSocket", state: "fail", detail: syncUrl });
          };
        } catch (e) {
          resolve({ label: "sync WebSocket", state: "fail", detail: String(e) });
        }
      });
      report(wsResult);

      report({ label: "server origin", state: "pass", detail: getServerOrigin() });
    }
    void run();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-panel p-6 font-mono text-sm text-text">
      <h1 className="mb-4 text-base">arcan device diagnostics</h1>
      <ul className="space-y-2">
        {checks.length === 0 && <li className="text-dim">running checks…</li>}
        {checks.map((c) => (
          <li key={c.label} data-testid={`diag-${c.state}`}>
            <span className={c.state === "fail" ? "text-red" : "text-dim"}>
              [{c.state === "pass" ? "ok" : c.state === "fail" ? "FAIL" : ".."}]
            </span>{" "}
            {c.label}
            {c.detail ? <span className="text-dim"> — {c.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Hoist the route above the Jazz provider in `src/main.tsx`**

`/diag` must render **above** `MessangerProvider` (JazzReactProvider). The provider has a blocking `Loading…` fallback while Jazz initialises — but Jazz itself requires IndexedDB and WASM. On the broken platforms `/diag` exists to diagnose (no IndexedDB, broken WASM, etc.) Jazz never initialises, so `/diag` would never render if it were inside the provider. The fix is to short-circuit at the entry point before any provider mounts:

```tsx
// src/main.tsx — add import alongside App import
import { DiagRoute } from './routes/diag.tsx'

// Replace the single createRoot call with a conditional:
// /diag is intentionally mounted ABOVE MessangerProvider (JazzReactProvider).
// MessangerProvider has a blocking "Loading…" fallback that prevents rendering
// until Jazz initialises — which itself requires IndexedDB and WASM. On the
// broken platforms /diag exists to diagnose (no IndexedDB, broken WASM, etc.)
// Jazz never initialises, so /diag would never render if it were inside the
// provider. Theme/accent providers are also omitted here; dark-mode loss on
// this single diagnostics page is acceptable. Token variables are available
// because tokens.css and index.css are imported above.
if (window.location.pathname === "/diag") {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DiagRoute />
    </StrictMode>,
  );
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MessangerProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MessangerProvider>
    </StrictMode>,
  );
}
```

Do **not** add a `/diag` route inside `src/App.tsx` — the registration in `main.tsx` is the single and only one. There is no need for an import of `DiagRoute` in `App.tsx`.

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm run check-tokens && npx vitest run`
Expected: PASS. Then open `http://localhost:5173/diag` in a browser (with `npm run sync` running): checks appear incrementally and all turn green.

```bash
git add gen/android src/routes/diag.tsx src/main.tsx
git commit -m "feat(android): gen/android project + /diag phase-0 diagnostics screen"
```

- [ ] **Step 5 (user/device): first on-device smoke**

`nix-shell shell.android.nix --run 'npm run android:dev'` with a USB-debugging device attached; navigate to `/diag`. Record results in `docs/testing/android-device-checklist.md` (Task 15). All six checks must pass before adapter work is trusted.

---

### Task 8: Notifications adapter

**Files:**
- Create: `src/platform/notifications.ts`
- Modify: `src/components/notification-manager.tsx:114-134`
- Modify: `src/routes/settings/index.tsx:99-124` (permission handling)
- Modify: `src/App.tsx` (channel init effect)
- Test: `tests/unit/platform/notifications.test.ts`

- [ ] **Step 1: Write the failing test (web paths; Tauri paths are dynamic-import stubs)**

```typescript
// tests/unit/platform/notifications.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  notificationsSupported,
  showNotification,
} from "@/platform/notifications";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notifications on web", () => {
  it("is supported when the Notification API exists", () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    expect(notificationsSupported()).toBe(true);
  });

  it("shows a web Notification when permission is granted", async () => {
    const ctor = vi.fn(function (this: any) {
      this.close = vi.fn();
    });
    (ctor as any).permission = "granted";
    vi.stubGlobal("Notification", ctor);

    await showNotification({ title: "Arcan", body: "hi", tag: "conv-1" });
    expect(ctor).toHaveBeenCalledWith(
      "Arcan",
      expect.objectContaining({ body: "hi", tag: "conv-1" }),
    );
  });

  it("does nothing when permission is not granted", async () => {
    const ctor = vi.fn();
    (ctor as any).permission = "denied";
    vi.stubGlobal("Notification", ctor);
    await showNotification({ title: "Arcan", body: "hi", tag: "t" });
    expect(ctor).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/platform/notifications.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```typescript
// src/platform/notifications.ts
import { isTauri, isTauriAndroid } from "./is-tauri";

/**
 * Notification adapter. Web: window.Notification (unchanged behavior).
 * Shell: @tauri-apps/plugin-notification. The plugin DOES patch window.Notification
 * in shell webviews (injected init script), but without channel routing — this
 * adapter exists for explicit channel routing (channelId "messages") + permission
 * control. The web-path fallback below must never run in the shell: the patched
 * constructor would fire channel-less notifications that Android drops silently.
 * Plugin modules are imported dynamically so web bundles stay clean.
 */
export const MESSAGES_CHANNEL_ID = "messages";

export function notificationsSupported(): boolean {
  return isTauri() || typeof Notification !== "undefined";
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (isTauri()) {
    const { isPermissionGranted } = await import("@tauri-apps/plugin-notification");
    return (await isPermissionGranted()) ? "granted" : "default";
  }
  return typeof Notification === "undefined" ? "denied" : Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isTauri()) {
    const { requestPermission } = await import("@tauri-apps/plugin-notification");
    // The plugin returns raw Tauri PermissionState which includes "prompt" and
    // "prompt-with-rationale" (Android) — normalize to the web NotificationPermission type.
    const result = await requestPermission();
    return result === "granted" || result === "denied" ? result : "default";
  }
  return Notification.requestPermission();
}

/** Android: create the messages channel once at startup (idempotent). */
export async function initNotificationChannel(): Promise<void> {
  if (!isTauriAndroid()) return;
  try {
    const { createChannel, Importance } = await import("@tauri-apps/plugin-notification");
    await createChannel({
      id: MESSAGES_CHANNEL_ID,
      name: "Messages",
      description: "New message notifications",
      importance: Importance.High,
    });
  } catch (err) {
    console.warn("[notifications]", err);
    // Channel creation failing must never break app startup.
  }
}

export interface ShowNotificationOptions {
  title: string;
  body: string;
  tag: string;
  onClick?: () => void;
}

export async function showNotification(opts: ShowNotificationOptions): Promise<void> {
  if (isTauri()) {
    try {
      const { sendNotification } = await import("@tauri-apps/plugin-notification");
      sendNotification({
        title: opts.title,
        body: opts.body,
        channelId: MESSAGES_CHANNEL_ID,
      });
      // Tap-to-route deep-linking via the plugin's onAction is a deferred stretch goal
      // (plan §Plan-time decisions 3); OS default (open app) applies.
    } catch (err) {
      console.warn("[notifications]", err);
      /* never throw into the notification fanout path */
    }
    return;
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }
  const n = new Notification(opts.title, {
    body: opts.body,
    tag: opts.tag,
    renotify: false,
  } as NotificationOptions);
  if (opts.onClick) {
    n.onclick = () => {
      opts.onClick?.();
      n.close();
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/platform/notifications.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Rewire `notification-manager.tsx` (lines 114-134)**

```typescript
import { isTauri } from "@/platform/is-tauri";
import { showNotification } from "@/platform/notifications";

// Gate: sound requires pref + hidden. In the shell the Android channel
// owns the sound — skip the mp3 to avoid double-sounding.
if (prefs?.sound && document.hidden && !isTauri()) {
  void new Audio("/notification.mp3").play().catch(() => {});
}
// Gate: notification requires pref + hidden (permission enforced inside
// the adapter for web; the shell plugin manages its own permission).
if (prefs?.browser && document.hidden) {
  void showNotification({
    title: "Arcan",
    body: `New message in ${event.conversationLabel}`,
    tag: `conv-${event.conversationID}`,
    onClick: () => {
      window.focus();
      window.location.assign(`/conversations/${event.conversationID}`);
    },
  });
}
```

(The old direct `Notification.permission === "granted"` gate moves inside the adapter — behavior on web is identical.)

- [ ] **Step 6: Rewire the settings toggle (`src/routes/settings/index.tsx:99-124`)**

Replace direct API touches with the adapter:

```typescript
import {
  notificationsSupported,
  requestNotificationPermission,
} from "@/platform/notifications";

// wherever `apiSupported` is computed:
const apiSupported = notificationsSupported();

// in handleBrowserToggle, replace `await Notification.requestPermission()`:
const result = await requestNotificationPermission();
```

Also find any read of `Notification.permission` used to initialize `permissionState` in this file and route it through `getNotificationPermission()` (it's async — initialize in a `useEffect`). Grep the file for `Notification.` to catch every site.

- [ ] **Step 7: Channel init at startup**

In `src/App.tsx`, add near the top of the `App` component body:

```typescript
import { useEffect } from "react"; // (already imported — merge)
import { initNotificationChannel } from "@/platform/notifications";

useEffect(() => {
  void initNotificationChannel();
}, []);
```

- [ ] **Step 8: Gates + commit**

Run: `npm run typecheck && npx vitest run && npm run check-tokens`
Expected: PASS.

```bash
git add src/platform/notifications.ts tests/unit/platform/notifications.test.ts src/components/notification-manager.tsx src/routes/settings/index.tsx src/App.tsx
git commit -m "feat(platform): notification adapter — plugin in shell, channel-owned sound on Android"
```

---

### Task 9: Native QR scanning

**Files:**
- Create: `src/platform/qr.ts`
- Modify: `src/qr/scanner.tsx`

- [ ] **Step 1: Write the platform wrapper**

```typescript
// src/platform/qr.ts
import { isTauriAndroid } from "./is-tauri";

/**
 * Native QR scan (Android shell only — the plugin has no desktop support).
 * Returns the decoded string, or null if the user cancelled / denied.
 * Web + desktop keep the qr-scanner getUserMedia path in src/qr/scanner.tsx.
 */
export function nativeQrAvailable(): boolean {
  return isTauriAndroid();
}

export async function scanQrNative(): Promise<string | null> {
  if (!isTauriAndroid()) return null;
  const { scan, Format, checkPermissions, requestPermissions } = await import(
    "@tauri-apps/plugin-barcode-scanner"
  );
  let permission = await checkPermissions();
  if (permission !== "granted") {
    permission = await requestPermissions();
  }
  if (permission !== "granted") return null;
  try {
    const result = await scan({ windowed: false, formats: [Format.QRCode] });
    return result.content || null;
  } catch {
    // Plugin throws on cancel — treat as "no scan".
    return null;
  }
}
```

- [ ] **Step 2: Add the native branch to `src/qr/scanner.tsx`**

Inside `QRScanner`, replace the camera pane column (the left `<div className="space-y-2">` containing the `<video>`) with a conditional. Add imports and a handler; the paste column stays shared and unchanged:

```tsx
import { nativeQrAvailable, scanQrNative } from "@/platform/qr";
import { useToast } from "@/components/toast"; // check the actual export name used elsewhere (grep useToast) and match it

// inside the component, alongside handlePasteSubmit:
async function handleNativeScan() {
  const data = await scanQrNative();
  if (data === null) return; // cancelled or denied — no state change
  if (!data.includes(expectedPathPrefix)) {
    setMismatch(true);
    return;
  }
  if (accepted.current) return;
  accepted.current = true;
  setMismatch(false);
  onUrl(data);
}
```

Camera pane JSX:

```tsx
<div className="space-y-2">
  <h3 className="text-sm font-medium">scan with camera</h3>
  {nativeQrAvailable() ? (
    <Button onClick={handleNativeScan} data-testid="qr-native-scan">
      open camera scanner
    </Button>
  ) : (
    <div className="aspect-square w-full overflow-hidden rounded-lg border bg-black">
      {/* existing video / denied JSX unchanged */}
    </div>
  )}
  {/* existing mismatch hint unchanged */}
</div>
```

Also guard the `useEffect` that starts the web scanner so it doesn't request `getUserMedia` on Android (first line of the effect):

```typescript
if (nativeQrAvailable()) return;
```

- [ ] **Step 3: Gates + commit**

Run: `npm run typecheck && npx vitest run && npm run test:e2e -- --grep-invert nothing 2>/dev/null || npm run test:e2e`
(The e2e suite exercises the paste path and web camera fallback; expect it green — if e2e can't run in this environment, run `npm run typecheck && npx vitest run` and note e2e deferred.)

```bash
git add src/platform/qr.ts src/qr/scanner.tsx
git commit -m "feat(platform): native QR scanning on Android via barcode-scanner plugin"
```

---

### Task 10: File pick & save adapters

**Files:**
- Create: `src/platform/files.ts`
- Modify: `src/components/attachment-tile.tsx:140-152` (download)
- Modify trigger sites: `src/routes/onboarding/profile-step.tsx`, `src/components/profile-view.tsx`, `src/routes/conversations/detail.tsx`, `src/routes/conversations/members.tsx`, `src/routes/settings/feedback-route.tsx`
- Test: `tests/unit/platform/files.test.ts`

**Review fixes applied (2026-07-10):**
- `sniffImageMime(bytes)` exported — reads PNG/JPEG/GIF/WebP magic bytes; `pickFilesNative` prefers sniff result over `inferMime(name)`. Rescues extension-less Android `content://` URIs.
- `PickFilesOptions.maxBytes?: number` — stat-checked before readFile (best-effort; stat failure falls through to read). Throws `"file is larger than the N MB limit"` without reading bytes.
- `inferMime` and `EXT_MIME` are now exported; `heic`/`heif` entries added.
- Every call site wraps `pickFilesNative` in try/catch and surfaces errors via its existing affordance: `setAvatarError` (profile-view, profile-step), `toast` (members, detail, feedback), `console.warn` (attachment-tile download).
- Feedback route first-slot click-target fixed: `onClick` moved to the padded container div (was only on inner button).
- Header comment updated: errors propagate BY DESIGN and call sites own the display.

- [ ] **Step 1: Write the failing test (web no-op contract)**

```typescript
// tests/unit/platform/files.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { pickFilesNative, saveBlobNative } from "@/platform/files";

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
});

describe("files adapter on web", () => {
  it("pickFilesNative returns null (caller falls back to <input type=file>)", async () => {
    expect(await pickFilesNative({ multiple: true })).toBeNull();
  });

  it("saveBlobNative returns false (caller falls back to anchor download)", async () => {
    expect(await saveBlobNative(new Blob(["x"]), "x.txt")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/platform/files.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```typescript
// src/platform/files.ts
import { isTauri } from "./is-tauri";

/**
 * File pick/save adapters.
 *
 * Contract: on web both functions are no-ops (null/false) and the caller
 * keeps its existing DOM path (<input type=file> / anchor download). This
 * keeps Playwright's setInputFiles and browser behavior untouched.
 *
 * In the shell, <input type=file> does not open a picker and <a download>
 * on blob: URLs silently does nothing (wry limitations) — the dialog + fs
 * plugins are the supported path.
 */
const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  mp4: "video/mp4",
  txt: "text/plain",
};

function inferMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

export interface PickFilesOptions {
  /** Restrict to images (maps to a dialog filter). */
  imagesOnly?: boolean;
  multiple?: boolean;
}

export async function pickFilesNative(
  opts: PickFilesOptions,
): Promise<File[] | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readFile } = await import("@tauri-apps/plugin-fs");

  const selection = await open({
    multiple: opts.multiple ?? false,
    filters: opts.imagesOnly
      ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
      : undefined,
  });
  if (selection === null) return [];
  const paths = Array.isArray(selection) ? selection : [selection];

  const files: File[] = [];
  for (const path of paths) {
    const bytes = await readFile(path);
    // Android returns content:// URIs; the last segment is the best name
    // we can get without extra native code. Good enough for upload naming.
    const name = decodeURIComponent(path.split("/").pop() ?? "file");
    files.push(new File([new Uint8Array(bytes)], name, { type: inferMime(name) }));
  }
  return files;
}

/** Returns true if the shell handled the save; false → caller uses anchor. */
export async function saveBlobNative(
  blob: Blob,
  filename: string,
): Promise<boolean> {
  if (!isTauri()) return false;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeFile } = await import("@tauri-apps/plugin-fs");

  const path = await save({ defaultPath: filename });
  if (!path) return true; // user cancelled — handled, don't anchor-download
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile(path, bytes);
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/platform/files.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Rewire the download site (`src/components/attachment-tile.tsx:140-152`)**

```typescript
import { saveBlobNative } from "@/platform/files";

async function handleDownload() {
  if (!streamID || !loadAs) return;
  const blob = await co.fileStream().loadAsBlob(streamID, { loadAs });
  if (!blob) return;
  if (await saveBlobNative(blob, filename)) return;
  const dlUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = dlUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(dlUrl);
}
```

- [ ] **Step 6: Rewire the five picker trigger sites**

Pattern (identical at every site): the button/affordance that currently does `fileInputRef.current?.click()` (or `iconInputRef`) becomes:

```typescript
import { pickFilesNative } from "@/platform/files";

async function openPicker() {
  const native = await pickFilesNative({ imagesOnly: true /* per site */, multiple: false /* per site */ });
  if (native) {
    if (native.length > 0) ingest(native);
    return;
  }
  fileInputRef.current?.click();
}
```

Where `ingest` is each site's existing file-handling function refactored to take `File[]` directly. Site-by-site:

1. `src/routes/onboarding/profile-step.tsx` — handler `handleAvatarChange(e)` reads `e.target.files?.[0]`. Extract its body into `ingestAvatar(file: File)`; the change handler and `openPicker` (imagesOnly, single) both call it. The trigger that clicks the input calls `openPicker`.
2. `src/components/profile-view.tsx:433-440` — same refactor as (1) around `handleAvatarChange`.
3. `src/routes/conversations/detail.tsx:559-562` — `handleFileInputChange` already delegates to `ingestFiles(files)`; `openPicker` (multiple, any type → `{ multiple: true }`) calls `ingestFiles` directly. Attach to the composer's attach button (find where `composer-file-input` gets clicked).
4. `src/routes/conversations/members.tsx:452-459` — `handleIconChange` → extract `ingestIcon(file)`; `openPicker({ imagesOnly: true })`.
5. `src/routes/settings/feedback-route.tsx:74-82,108` — `onFileChange` collects `Array.from(e.target.files ?? [])`; extract `ingestFiles(files: File[])`; both trigger buttons call `openPicker({ multiple: true })`.

The hidden `<input type="file">` elements and their `data-testid`s stay — web behavior and Playwright fixtures unchanged.

- [ ] **Step 7: Gates + commit**

Run: `npm run typecheck && npx vitest run && npm run test:e2e`
Expected: PASS (e2e specifically covers composer attachments + avatar flows; if e2e unavailable in this environment, note it).

```bash
git add src/platform/files.ts tests/unit/platform/files.test.ts src/components/attachment-tile.tsx src/routes/onboarding/profile-step.tsx src/components/profile-view.tsx src/routes/conversations/detail.tsx src/routes/conversations/members.tsx src/routes/settings/feedback-route.tsx
git commit -m "feat(platform): native file pick/save adapters; web DOM paths unchanged"
```

---

### Task 11: Server override UI on the login screen

> **Refactor note (2026-07-10):** The apply() flow was restructured to validate → probe → persist,
> eliminating the rollback pattern. `validateServerOrigin(raw): string` is now a separate
> exported pure function in `server-config.ts`; `setServerOverride` calls it internally.
> The probe uses `AbortSignal.timeout(10_000)` and catches all fetch errors into a single
> friendly string. Persist step (set/clear) runs only after probe success — if storage throws
> the message passes through, nothing was persisted, nothing needs rollback. Tests use
> `vi.importActual` for `validateServerOrigin`/`bakedOrigin` so real validation logic runs.

**Files:**
- Create: `src/components/server-override.tsx`
- Modify: `src/routes/auth/login.tsx` (mount below `SignInScreen`)

- [ ] **Step 1: Write the component**

Check `src/components/modal-shell.tsx` for the actual ModalShell props (grep its export) and match them; the sketch below assumes `open`, `onClose`, `title` children — adjust to the real API:

```tsx
// src/components/server-override.tsx
import { useState } from "react";
import { isTauri } from "@/platform/is-tauri";
import {
  bakedOrigin,
  getServerOrigin,
  getServerOverride,
  setServerOverride,
  clearServerOverride,
} from "@/platform/server-config";
import { clearAuthToken } from "@/platform/auth-transport";
import { ModalShell } from "@/components/modal-shell";
import { Button } from "@/components/ui/button";

/**
 * Shell-only server switcher (spec §Server configuration): a quiet line at
 * the foot of the login screen showing the configured server; tapping opens
 * a dialog to change it. Saving clears the bearer token and reloads.
 */
export function ServerOverride() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(getServerOverride() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  if (!isTauri()) return null;

  const current = new URL(getServerOrigin()).host;

  async function apply(origin: string | null) {
    setError(null);
    setChecking(true);
    // Capture current override before writing so we can roll back if the probe fails.
    const prev = getServerOverride();
    try {
      // setServerOverride validates the URL and throws a user-facing message on
      // bad input (e.g. missing https). We call it first so validation errors
      // surface before any network probe. On reset (origin === null) there's
      // nothing to validate; the baked origin is always well-formed.
      if (origin !== null) {
        setServerOverride(origin);
      }
      const target = origin ?? bakedOrigin();
      // Reachability probe — better-auth exposes /api/auth/ok on every
      // deployment; any HTTP response (even 404) proves the host resolves
      // and speaks TLS. Network-level failure is the signal we care about.
      await fetch(`${target}/api/auth/ok`, { method: "GET" });
      if (origin === null) {
        clearServerOverride();
      }
      clearAuthToken();
      window.location.assign("/");
    } catch (e) {
      // Probe failed — restore the previous override so a shown error never
      // leaves a changed server behind.
      if (origin !== null) {
        prev === null ? clearServerOverride() : setServerOverride(prev);
      }
      setError(
        e instanceof Error ? e.message : "Could not reach that server. Check the address and try again.",
      );
      setChecking(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="mx-auto mt-4 block text-ui-caption text-dim underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
        data-testid="server-override-trigger"
      >
        server: {current}
      </button>
      {open && (
        <ModalShell title="Change server" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <p className="text-ui-caption text-dim">
              Point this app at a different Arcan server. Your session on the
              current server will be signed out.
            </p>
            <input
              className="w-full rounded-r-4 border border-hairline bg-panel p-2 font-mono text-sm text-text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="https://chat.example.com"
              data-testid="server-override-input"
            />
            {error && (
              <p className="text-ui-caption text-red" data-testid="server-override-error">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => void apply(value)}
                disabled={checking || !value.trim()}
                data-testid="server-override-save"
              >
                {checking ? "checking…" : "use this server"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => void apply(null)}
                disabled={checking}
                data-testid="server-override-reset"
              >
                reset to default
              </Button>
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}
```

Token-guard note: the classes above use token utilities (`text-dim`, `border-hairline`, `bg-panel`, `text-red`, `text-ui-caption`, `rounded-r-4`) — run `npm run check-tokens` and match the exact utility names used by neighboring components (grep `text-ui-caption` to confirm it exists; if the caption class differs, use whatever `login.tsx`'s error slot uses).

- [ ] **Step 2: Mount it in `src/routes/auth/login.tsx`**

```tsx
import { ServerOverride } from "@/components/server-override";

// in the returned JSX:
return (
  <div className="h-screen w-screen flex flex-col">
    <SignInScreen … />
    <ServerOverride />
  </div>
);
```

(`ServerOverride` renders `null` on web — zero visual change for the web app; e2e untouched.)

- [ ] **Step 3: Gates + commit**

Run: `npm run typecheck && npm run check-tokens && npx vitest run`
Expected: PASS.

```bash
git add src/components/server-override.tsx src/routes/auth/login.tsx
git commit -m "feat(shell): server override affordance on the login screen"
```

---

### Task 12: Deep links — App Links config, URL bridge, cross-instance prompt

**Files:**
- `src/platform/deep-link.ts`
- `src/components/deep-link-bridge.tsx`
- `src/App.tsx` (bridge mounted)
- `tests/unit/platform/deep-link.test.ts`
- `tests/unit/components/deep-link-bridge.test.tsx`

> **Status: COMPLETE.** Steps below reflect implemented reality; code blocks show
> the actual shipped code, not the original scaffolding.

- [x] **Step 1: Pure URL logic tests** — `tests/unit/platform/deep-link.test.ts`

  Seven cases covering same-origin navigation, search+hash preservation, foreign
  invite detection, garbage rejection, exact `/invite` match, `/invite/<sub>`
  prefix, and `/invitees` false-positive guard.  The file also imports
  `_resetInitialUrlConsumedForTests` for use in `beforeEach`.

- [x] **Step 2–4: Implementation** — `src/platform/deep-link.ts`

```typescript
import { isTauri } from "./is-tauri";

export type IncomingUrl =
  | { kind: "navigate"; to: string }
  | {
      kind: "foreign";
      origin: string;
      to: string;
      hash: string;
      isInvite: boolean;
    }
  | null;

export function classifyIncomingUrl(
  raw: string,
  currentOrigin: string,
): IncomingUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const to = `${url.pathname}${url.search}${url.hash}`;
  if (url.origin === currentOrigin) {
    return { kind: "navigate", to };
  }
  return {
    kind: "foreign",
    origin: url.origin,
    to,
    hash: url.hash,
    // /invite and /invite/<anything> are invite paths; /invitees etc. are not.
    isInvite: url.pathname === "/invite" || url.pathname.startsWith("/invite/"),
  };
}

// The plugin never clears currentUrl; the cold-start URL must be consumed
// exactly once per JS context. A fresh context after the switch-server reload
// re-consumes by design.
let initialUrlConsumed = false;

/** Test-only reset — do not call in production code. */
export function _resetInitialUrlConsumedForTests(): void {
  initialUrlConsumed = false;
}

/**
 * Subscribe to deep links (shell only). Fires for the cold-start URL too.
 * Returns an unsubscribe function.
 */
export async function initDeepLinks(
  onUrl: (url: string) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { onOpenUrl, getCurrent } = await import("@tauri-apps/plugin-deep-link");
  if (!initialUrlConsumed) {
    initialUrlConsumed = true;
    const initial = await getCurrent();
    if (initial) {
      for (const u of initial) onUrl(u);
    }
  }
  const unlisten = await onOpenUrl((urls) => {
    for (const u of urls) onUrl(u);
  });
  return unlisten;
}
```

Key implementation details vs. original scaffold:
- **Once-per-context flag** (`initialUrlConsumed`): `getCurrent()` is called at
  most once per JS context lifetime.  A switch-server reload creates a new
  context, so the cold-start URL is re-consumed correctly on that load.
- **Test-reset export** (`_resetInitialUrlConsumedForTests`): allows unit tests
  to reset the module-level flag without a full `vi.resetModules()`.
- **Exact `isInvite` match**: `url.pathname === "/invite" || url.pathname.startsWith("/invite/")` —
  guards against `/invitees` being mis-classified.

- [x] **Step 5: Bridge component** — `src/components/deep-link-bridge.tsx`

```tsx
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isTauri } from "@/platform/is-tauri";
import { classifyIncomingUrl, initDeepLinks } from "@/platform/deep-link";
import {
  getServerOrigin,
  setServerOverride,
  probeServer,
} from "@/platform/server-config";
import { clearAuthToken } from "@/platform/auth-transport";
import { useConfirm } from "@/components/confirm-dialog";

/**
 * Shell-only: routes App Link arrivals into react-router; foreign-instance
 * links get a switch-server confirmation (spec §Deep links).
 *
 * Mount UNCONDITIONALLY in App (self-gates on isTauri) — unauthenticated
 * arrivals must work too. Must be inside BrowserRouter (needs useNavigate)
 * and ConfirmProvider (needs useConfirm) — both are satisfied by App.tsx's
 * provider stack.
 */
export function DeepLinkBridge() {
  const navigate = useNavigate();
  const confirm = useConfirm();

  // Keep latest navigate/confirm in refs so the handler (closed over in the
  // init effect) always calls the current version without re-running init.
  const navigateRef = useRef(navigate);
  const confirmRef = useRef(confirm);

  useEffect(() => {
    navigateRef.current = navigate;
  });
  useEffect(() => {
    confirmRef.current = confirm;
  });

  // Init effect runs ONCE per mount (empty deps). Re-navigation never
  // re-invokes initDeepLinks so the cold-start URL is not re-dispatched.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    // cancelled tracks whether the component unmounted before the async init
    // resolved, so we can properly clean up the late-resolved unlisten fn.
    let cancelled = false;

    void initDeepLinks((raw) => {
      const incoming = classifyIncomingUrl(raw, getServerOrigin());
      if (!incoming) return;

      if (incoming.kind === "navigate") {
        navigateRef.current(incoming.to);
        return;
      }

      // Foreign instance → ask before repointing the app.
      void (async () => {
        const host = new URL(incoming.origin).host;
        const ok = await confirmRef.current({
          title: "Switch server?",
          body: `You'll be signing in through ${host} — everything you send will go through that server. Only switch if you trust its operator. You'll be signed out here first.`,
          confirmLabel: "switch server",
          danger: true,
        });
        if (!ok) return;

        // Probe the foreign origin before committing. The CORS config on the
        // server gates whether the probe succeeds in a browser context; an
        // unreachable or non-Arcan server silently bails.
        if (!(await probeServer(incoming.origin))) {
          console.warn("[deep-link] foreign server probe failed — switch aborted", incoming.origin);
          return;
        }

        // setServerOverride validates + persists; it can throw if storage is
        // unavailable (QuotaExceededError, security policy). On failure we
        // warn and bail — no reload, no token clear — so the user stays on
        // the current server rather than ending up in a half-switched state.
        try {
          setServerOverride(incoming.origin);
        } catch (err) {
          console.warn("[deep-link] setServerOverride failed — switch aborted", err);
          return;
        }

        // Stash the pending invite AFTER persist succeeds (M1: the new
        // context needs it available when it loads the invite route).
        if (incoming.isInvite && incoming.hash) {
          try {
            sessionStorage.setItem("pending-invite-fragment", incoming.hash);
          } catch {
            /* degrade gracefully — invite replay skipped */
          }
        }

        clearAuthToken();
        window.location.assign(incoming.isInvite ? "/" : incoming.to);
      })();
    }).then((fn) => {
      // If the component unmounted before init resolved, invoke unlisten
      // immediately to avoid a subscription leak.
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []); // empty deps — see navigate/confirm refs above

  return null;
}
```

Key implementation details vs. original scaffold:
- **`navigate`/`confirm` refs**: avoids re-running the init effect on every
  render while still calling the latest versions of the hooks.
- **`cancelled` flag**: if the component unmounts before the async init
  resolves, the late-resolved `unlisten` fn is invoked immediately to prevent
  a subscription leak.
- **`probeServer` before switch**: verifies the foreign origin is reachable
  before committing to a server change.
- **`setServerOverride` in try/catch**: guards against `QuotaExceededError`
  or security-policy failures; on error the user stays on the current server.
- **Stash after persist**: `sessionStorage.setItem("pending-invite-fragment")`
  runs only after `setServerOverride` succeeds.
- **`danger: true`** on the confirm dialog + trust-decision consent copy:
  "You'll be signing in through … Only switch if you trust its operator."
- **`isInvite ? "/" : incoming.to`** on the `location.assign` call: foreign
  invites reload at `/` so the new context picks up the stashed fragment.
- **Import path**: `@/components/confirm-dialog` (not `@/components/confirm`).

- [x] **Step 6: Mount inside the router** — `src/App.tsx`

  `<DeepLinkBridge />` mounted unconditionally alongside `<NotificationManager />`.

- [x] **Step 7: Component tests** — `tests/unit/components/deep-link-bridge.test.tsx`

  Four assertions:
  1. `initDeepLinks` called exactly once on mount.
  2. Re-render does NOT call `initDeepLinks` again (C1 regression guard for refs pattern).
  3. Unmount before init resolves → late-resolved unlisten fn is invoked (cancelled-flag cleanup).
  4. Same-origin URL → `navigate` called with path+search+hash.

- [x] **Step 8: Once-flag unit test** — `tests/unit/platform/deep-link.test.ts`

  `initDeepLinks once-flag` describe block: mocks `@tauri-apps/plugin-deep-link` via
  `vi.doMock`, stubs `window.__TAURI_INTERNALS__`, calls `vi.resetModules()` and
  does a fresh `import` of the module.  Verifies `getCurrent` called ONCE across
  two `initDeepLinks` calls, then `_resetInitialUrlConsumedForTests()` lets a third
  call hit `getCurrent` again.

---

### Task 13: Platform purity guard

**Files:**
- Create: `scripts/check-platform-purity.sh`
- Modify: `package.json` (script entry)

- [ ] **Step 1: Write the guard (mirrors `scripts/check-ui-purity.sh`)**

```bash
#!/usr/bin/env bash
# scripts/check-platform-purity.sh — @tauri-apps/* may only be imported
# under src/platform/. Everything else goes through the adapter layer.
set -euo pipefail

hits=$(grep -rnE "[\"'\`]@tauri-apps" src \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "^src/platform/" || true)

if [ -n "$hits" ]; then
  echo "❌ platform purity violation — import @tauri-apps only in src/platform/:"
  echo "$hits"
  exit 1
fi
echo "✓ platform purity: @tauri-apps imports confined to src/platform/"
```

Run: `chmod +x scripts/check-platform-purity.sh`

- [ ] **Step 2: Add the npm script**

In `package.json` scripts: `"check-platform-purity": "./scripts/check-platform-purity.sh"`.

- [ ] **Step 3: Verify both directions**

Run: `npm run check-platform-purity`
Expected: `✓` (all plugin imports so far are dynamic imports inside `src/platform/`).
Then temporarily add `import "@tauri-apps/api/core";` to `src/App.tsx`, run again — expected: ❌ with the hit listed. Revert the temp line.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-platform-purity.sh package.json
git commit -m "chore(guard): check-platform-purity — @tauri-apps confined to src/platform"
```

---

### Task 14: CI — Android build + GitHub Release

**Files:**
- Create: `.github/workflows/android.yml`
- Create: `docs/android-signing.md`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/android.yml
name: android

on:
  push:
    branches: [main]
    tags: ["android-v*"]
  pull_request:
    paths:
      - "src/**"
      - "src-tauri/**"
      - "gen/android/**"
      - "package.json"
      - ".github/workflows/android.yml"

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Install NDK
        run: sdkmanager "ndk;27.0.12077973"

      - name: Set up Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-linux-android,armv7-linux-androideabi,i686-linux-android,x86_64-linux-android

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: npm install
        run: npm ci

      - name: Decode signing keystore
        if: startsWith(github.ref, 'refs/tags/android-v')
        run: |
          echo "$ANDROID_KEYSTORE_B64" | base64 -d > gen/android/keystore.jks
          cat > gen/android/keystore.properties <<EOF
          storeFile=keystore.jks
          storePassword=$ANDROID_KEYSTORE_PASSWORD
          keyAlias=$ANDROID_KEY_ALIAS
          keyPassword=$ANDROID_KEY_PASSWORD
          EOF
        env:
          ANDROID_KEYSTORE_B64: ${{ secrets.ANDROID_KEYSTORE_B64 }}
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}

      - name: Build APK
        run: npm run tauri android build -- --apk
        env:
          NDK_HOME: ${{ env.ANDROID_SDK_ROOT }}/ndk/27.0.12077973
          VITE_ARCAN_ORIGIN: ${{ vars.ARCAN_ORIGIN }}

      - uses: actions/upload-artifact@v4
        with:
          name: arcan-apk
          path: gen/android/app/build/outputs/apk/universal/release/*.apk

      - name: GitHub Release
        if: startsWith(github.ref, 'refs/tags/android-v')
        uses: softprops/action-gh-release@v2
        with:
          files: gen/android/app/build/outputs/apk/universal/release/*.apk
          generate_release_notes: true
```

Notes for the implementer:
- Unsigned (non-tag) builds produce an unsigned release APK — fine as a compile gate; the artifact is not installable without signing.
- The exact APK output path can differ by Tauri CLI version — after the first CI run, check the build log and correct the two `path:` globs if needed.
- `vars.ARCAN_ORIGIN` is a repo Actions *variable* (not secret) the user sets to the real domain.

- [ ] **Step 2: Wire the keystore into Gradle**

Per Tauri's Android signing docs, edit `gen/android/app/build.gradle.kts`: load `keystore.properties` and add a `release` signing config. Add exactly this (adapt if the file's Kotlin DSL structure differs — the generated file already has `android { ... buildTypes { release { ... } } }`):

```kotlin
import java.util.Properties
import java.io.FileInputStream

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }
    buildTypes {
        getByName("release") {
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}
```

Also add to `gen/android/.gitignore` (create if missing): `keystore.properties` and `keystore.jks`.

- [ ] **Step 3: Write the signing doc**

```markdown
<!-- docs/android-signing.md -->
# Android signing & release

## One-time keystore generation (run locally, keep out of git)

    keytool -genkey -v -keystore arcan-release.jks -keyalg RSA \
      -keysize 2048 -validity 10000 -alias arcan

Store the .jks + both passwords in your password manager. This key doubles
as the Play upload key if we ever enroll — losing it means users must
uninstall/reinstall.

## Fingerprint for App Links (assetlinks.json)

    keytool -list -v -keystore arcan-release.jks -alias arcan | grep SHA256

Paste the SHA256 value into deploy's assetlinks.json (see deploy/README.md).

## GitHub Actions secrets (repo → Settings → Secrets and variables)

Secrets: ANDROID_KEYSTORE_B64 (`base64 -w0 arcan-release.jks`),
ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS (=arcan), ANDROID_KEY_PASSWORD.
Variable: ARCAN_ORIGIN (=https://<your-domain>).

## Cutting a release

    git tag android-v0.1.0 && git push origin android-v0.1.0

CI builds the signed APK and attaches it to a GitHub Release. Obtainium
users add the repo URL once; new releases update automatically.
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/android.yml gen/android/app/build.gradle.kts gen/android/.gitignore docs/android-signing.md
git commit -m "ci(android): build + signed GitHub Release workflow; signing docs"
```

---

### Task 15: Deploy artifacts — assetlinks.json + docs wrap-up

**Files:**
- Create: `deploy/assetlinks.json.example`
- Modify: `deploy/README.md` (App Links section)
- Create: `docs/testing/android-device-checklist.md`
- Modify: `CLAUDE.md` (status entry)

- [ ] **Step 1: assetlinks template**

```json
// deploy/assetlinks.json.example — copy to the Caddy web root as
// .well-known/assetlinks.json with the real fingerprint (docs/android-signing.md)
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "eu.meteory.arcan",
      "sha256_cert_fingerprints": [
        "REPLACE:WITH:RELEASE:KEY:SHA256:FINGERPRINT"
      ]
    }
  }
]
```

Append to `deploy/README.md`:

```markdown
## Android App Links

The Android app opens https://$DOMAIN/invite and /pair links directly. For
Android to verify that, serve `.well-known/assetlinks.json` from the SPA
web root (the existing `handle` block's `file_server` serves it — just add
the file):

    cp assetlinks.json.example <caddy-webroot>/.well-known/assetlinks.json

Fill in the release-key SHA256 fingerprint per docs/android-signing.md.
Verify after deploy: https://$DOMAIN/.well-known/assetlinks.json returns
JSON with content-type application/json.
```

Note: JSON files can't carry comments — strip the leading comment line when writing the actual `assetlinks.json.example`; keep the explanation in the README instead.

- [ ] **Step 2: Device checklist doc**

```markdown
<!-- docs/testing/android-device-checklist.md -->
# Android on-device checklist

Run before each android-v* release tag. Device: real hardware, USB debugging.
Record date + device + result per line.

## Phase 0 — platform assumptions (/diag)
- [ ] /diag: secure context PASS
- [ ] /diag: WebCrypto PASS
- [ ] /diag: WASM (argon2id) PASS
- [ ] /diag: IndexedDB write PASS
- [ ] /diag: sync WebSocket PASS (against the real deployment)

## Core flows
- [ ] Install signed APK (adb install or Obtainium)
- [ ] Create account → bearer login → relaunch app → still signed in
- [ ] Send + receive messages against a web client (both directions, live)
- [ ] Attach an image from the picker; verify it renders both ends
- [ ] Save a received attachment (SAF dialog → file lands where chosen)
- [ ] Set/change avatar from the picker
- [ ] QR pairing: native scanner pairs against a second device/browser
- [ ] Camera permission denied → passphrase fallback still pairs
- [ ] Invite link tap opens the app (warm AND cold start)
- [ ] Foreign-instance link → switch-server prompt appears; cancel keeps state
- [ ] Notification fires while app is backgrounded-but-alive; tap opens app
- [ ] Notification permission denied → in-app toasts still work
- [ ] Server override → bogus https origin → clear error; reset to default works
- [ ] Copy invite link / copy passphrase (clipboard) — if broken, file the
      clipboard-manager plugin follow-up (spec plan-time decision 2)
- [ ] Kill app → reopen → data present, sync catches up
- [ ] Update install (v N-1 → N) preserves account + messages
```

- [ ] **Step 3: CLAUDE.md status entry**

Add under the UI-rework Units list (or a new "## Native shells" subsection under Status):

```markdown
### Native shells

- Android (Tauri 2 bundled shell) — IN PROGRESS on branch `worktree-android-tauri-spec`.
  Spec: `docs/superpowers/specs/2026-07-09-android-tauri-app-design.md`.
  Plan: `docs/superpowers/plans/2026-07-09-android-tauri-app.md`.
  `src/platform/` is the only layer that may import `@tauri-apps/*`
  (enforced by `npm run check-platform-purity`). Follow-ups: background
  push notifier spec; Windows/Linux desktop shell spec.
```

- [ ] **Step 4: Final gates + commit**

Run: `npm run typecheck && npx vitest run && npm run check-tokens && npm run check-ui-purity && npm run check-platform-purity && npm run lint`
Expected: all PASS.

```bash
git add deploy/assetlinks.json.example deploy/README.md docs/testing/android-device-checklist.md CLAUDE.md
git commit -m "docs(android): assetlinks template, device checklist, status entry"
```

---

## Post-plan: what remains manual (user)

1. Set the real domain: `VITE_ARCAN_ORIGIN` (local `.env` + GitHub Actions variable `ARCAN_ORIGIN`) and the `deep-link` host in `src-tauri/tauri.conf.json`.
2. Confirm/replace the identifier `eu.meteory.arcan` (in `tauri.conf.json` **before** first `tauri android init` if possible — it's baked into `gen/android` package paths).
3. Generate the keystore + set GitHub secrets (docs/android-signing.md).
4. Deploy `assetlinks.json` to the Caddy web root.
5. Run the on-device checklist (docs/testing/android-device-checklist.md) — especially Phase 0 `/diag` before trusting the adapters.

## Explicitly out of scope (per spec)

Background/killed-app delivery + push, desktop shells, iOS, Play Store submission, service worker, `arcan://` custom scheme, Android Keystore token hardening.
