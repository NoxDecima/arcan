# Android app via Tauri 2 (bundled shell) — design

**Date:** 2026-07-09
**Status:** approved design, pre-plan
**Server-side footprint:** additive bearer-auth plugin + shell-origin CORS in `api/`; one static
`assetlinks.json` in the Caddy config. Web client behavior unchanged.
**Follow-ups spawned by this spec:** Android background delivery (push notifier), Windows/Linux desktop shells

## Context

Arcan is a web-first PWA (Vite + React 19 + jazz-tools 0.20.18). This spec covers shipping it
as a native Android app using a Tauri 2 **bundled shell**: the built Vite assets ship inside the
APK, native capabilities come from official Tauri plugins behind a feature-detected platform
layer, and the web app itself stays the single codebase.

Session research (2026-07-08) established the platform facts this design relies on:

- Tauri 2 mobile targets are stable (since 2.0, 2024-10); the webview is the evergreen
  Android System WebView (Chromium).
- `<input type="file">` and `<a download>` (blob save) do not work reliably in Tauri webviews;
  the dialog + fs plugins are the supported path.
- The official `barcode-scanner` plugin scans QR via the **native camera** on Android — no
  webview `getUserMedia` needed.
- The notification plugin does **not** patch `window.Notification`; it requires its own JS API.
- Bundled shells run on `https://tauri.localhost` (with `useHttpsScheme: true`), so
  better-auth's same-origin cookie sessions break; better-auth's bearer plugin is the fix.
- Switching the origin scheme after first release resets IndexedDB/localStorage — the scheme
  choice is permanent.
- Android App Link domains are fixed at build time (manifest + `assetlinks.json`); runtime
  domains cannot become verified handlers.

## Decisions log (from brainstorm)

| Decision | Choice |
| --- | --- |
| First target | Android app directly (no separate validation spike; spike absorbed as Phase 0) |
| Background message delivery | **Out of scope** — foreground-only v1; push notifier is its own follow-up spec |
| Distribution | Direct APK + Obtainium now; keystore/versioning kept Play-compatible for a later store release |
| Server selection | Baked default (`VITE_ARCAN_ORIGIN`) + subtle override affordance on the login screen |
| Shell architecture | Bundled assets (rejected: remote-URL shell, TWA) |
| Auth | Server accepts cookie **and** bearer; web keeps cookies (XSS-immune, zero migration), shells use bearer |
| Cross-instance invite arrivals | Switch-server prompt in scope (reuses pending-invite stash + override machinery) |
| Custom `arcan://` scheme | Deferred until multi-instance usage is real |

## Non-goals

- Background/killed-app message delivery and push notifications (follow-up spec: E2EE-safe
  notifier service + UnifiedPush/ntfy or FCM + Kotlin receiver).
- Windows/Linux/macOS desktop shells (separate spec; this spec deliberately builds the pieces
  they will reuse: scaffold, platform layer, bearer auth, save-blob adapter).
- iOS.
- Play Store submission (kept possible, not performed).
- Service worker / PWA installability work (irrelevant to a bundled shell).

## Architecture

### Repo layout

```
src-tauri/            Tauri crate: tauri.conf.json, capabilities/, icons/, lib.rs
src-tauri/gen/android/  generated Gradle/Kotlin project (committed)
src/platform/         platform abstraction layer (the ONLY module that may import @tauri-apps/*)
```

No restructuring of existing code. `src/ui/` (kit + screens) never imports `src/platform/`;
only `src/components/` and routes do. Enforced (see Guardrails).

### Origin & scheme

`useHttpsScheme: true` from day one → app origin is `https://tauri.localhost`, a secure context
(WebCrypto, WASM, IndexedDB all available; BrowserRouter works). This choice is permanent:
switching schemes later wipes webview storage.

### Platform abstraction layer (`src/platform/`)

Capability functions, each with a web implementation (current behavior, unchanged) and a Tauri
implementation, selected via `isTauri()` from `@tauri-apps/api/core`:

| Capability | Web impl | Tauri impl |
| --- | --- | --- |
| `scanQr()` | `qr-scanner` + `getUserMedia` (unchanged) | `barcode-scanner` plugin, native camera view (no `windowed` mode in v1) |
| `pickFiles(opts)` | `<input type="file">` | dialog plugin (content URIs) + fs plugin → wrapped as `File` objects, byte-identical downstream |
| `saveBlob(blob, name)` | object URL + `<a download>` | dialog `save()` + fs `writeFile` (SAF picker on Android) |
| `notify(payload)` | `window.Notification` | notification plugin (channel-based) |
| `serverConfig()` | `window.location.origin` | baked default + persisted override (below) |

Downstream consumers (Jazz `FileStream`, `createImage`, canvas avatar resize, composer,
feedback form) are untouched — adapters return the same shapes the web paths produce.

Known risk, accepted: `navigator.clipboard` in the Android WebView is historically finicky.
If copy-invite/copy-passphrase misbehave on device, add the clipboard-manager plugin behind
the same adapter pattern (~10 lines).

### Server configuration

`ServerConfig = { origin: string }`.

- Baked default: `VITE_ARCAN_ORIGIN` at build time (the deployed `DOMAIN` from the Caddy stack).
- Runtime override: persisted in `localStorage`, read **before** the Jazz provider boots.
- Derived values: `wss://<origin>/sync/`, `https://<origin>/api/auth`, feedback endpoint,
  canonical origin for generated invite/pairing links (replaces the current
  `window.location.origin` derivation — a no-op on web).
- Changing the server clears the bearer token and reloads the app.

Override UI: a quiet `server: <domain>` line at the foot of `src/routes/auth/login.tsx`,
shell-only. Tap → small ModalShell dialog: origin input, validation (`https://` required,
reachability check against the auth endpoint), "reset to default". A bad override cannot brick
the app: sync failure is non-fatal and the login screen always renders.

## Auth

**Server (additive; web unchanged).** Enable better-auth's `bearer` plugin in `api/`:
sign-in responses carry a `set-auth-token` header; requests may authenticate via
`Authorization: Bearer <token>`. Add narrow CORS on `/api/*` for shell origins
(`https://tauri.localhost`, `tauri://localhost` for the future desktop build), with
`Authorization` in allowed headers. One server accepts both transports.

**Client (one module in `src/platform/`).** In the shell: capture `set-auth-token` on sign-in,
persist in `localStorage` (sandboxed app storage — acceptable v1; Android Keystore hardening
can ride along with the push spec), attach the header on all better-auth calls and the feedback
upload. Inert on web. Logout and server-override changes clear the token.

**Why web keeps cookies:** HTTP-only cookies are invisible to JS (XSS cannot exfiltrate the
session); moving web to bearer would add code to the web path *and* weaken it. The dual
transport is ~30 lines in one tested module. Zero-knowledge property unchanged: the token
authenticates the same endpoints the cookie did; E2EE keys and the KDF flow never leave the
client. The sync WebSocket is unaffected (it does not use cookie auth).

## Deep links & the invite flow

- **Generated links unchanged**: invites/pairing links point at the canonical web origin, so
  recipients without the app land in the web client.
- **App Links**: deep-link plugin registers the app as verified handler for the baked domain.
  Requires serving `/.well-known/assetlinks.json` (package name + release-key SHA-256
  fingerprint) — one static-file addition to the Caddy config in the deploy repo.
- **Single entry point**: `handleIncomingUrl(url)` maps arrivals onto react-router
  (path + search + hash). Fed by: deep-link event (warm), cold-start deep link (queried after
  Jazz boots), and the native QR scanner's result string. Pairing secrets ride in the URL hash;
  with App Links the full URL stays on-device inside the intent — the server never sees secrets.
- **Cross-instance arrivals** (in scope): if an arriving URL's origin ≠ current
  `serverConfig().origin`, prompt "This invite belongs to `<domain>` — switch server?"
  Accepting sets the override, stashes the pending invite (existing pending-invite
  `sessionStorage` mechanism), reloads, continues the flow.
- **Limitations, documented**: verified App Links exist only for the baked domain (Android
  design constraint — runtime domains cannot be added). Foreign-instance links tapped in a chat
  open the browser. In-app QR scanning intentionally drops foreign-origin results (the contacts
  scan screen classifies scanned URLs and rejects origins that don't match the current server);
  foreign-instance QRs currently require the switch-server flow via a tapped link or manual
  server override. Routing scan results through `classifyIncomingUrl` to trigger the switch-server
  prompt is a follow-up. A custom `arcan://` scheme is a deferred follow-up if multi-instance
  usage materializes.

## Notifications (foreground-only v1)

- "Messages" channel created at startup; channel owns the sound (skip the web `Audio()` mp3 in
  the shell to avoid double-sounding).
- `POST_NOTIFICATIONS` runtime permission requested via the plugin, wired to the existing
  settings toggle.
- Existing `document.hidden` gating carries over: notifications fire while the app is
  backgrounded-but-alive. Tap = open/focus app. Deep-routing to the specific conversation on
  tap is a stretch goal, not v1.
- **Documented limitation**: once Android kills the process, delivery stops until the app is
  reopened. Removing this limitation is the push-notifier follow-up spec.

## Packaging, distribution, CI

- **Keystore**: one release keystore, generated once, never committed (local + backup; CI gets
  it as an encrypted secret). Doubles as the Play upload key later — no resigning. Its
  fingerprint feeds `assetlinks.json`.
- **Versioning**: derived from `package.json` (Tauri maps to `versionCode`/`versionName`).
- **Min SDK**: Tauri default (API 24 / Android 7); WebView is evergreen via Play.
- **Build**: `tauri android build --apk` → signed universal APK.
- **CI**: GitHub Actions ubuntu runner (Rust + Android SDK/NDK); build on push, publish APK on
  version tags. Channel: **GitHub Releases** (decided post-review); Obtainium points at the
  repo's releases feed.
- **Updates**: Obtainium. No in-app updater in v1.
- **Local toolchain**: separate `shell.android.nix` (Rust, Android SDK/NDK, JDK) so the base
  dev shell stays light.

## Error handling

| Situation | Behavior |
| --- | --- |
| Offline start | Bundled assets boot; Jazz loads local IndexedDB; sync reconnects (existing connection-banner behavior) |
| Bad/unreachable server override | Non-fatal; login screen with override affordance always renders |
| Camera permission denied | Existing passphrase pairing fallback |
| Notification permission denied | Current in-app-only behavior (same gating as web) |
| Reinstall | IndexedDB gone → re-pair via existing QR/passphrase flow (same as cleared browser); documented, not mitigated |
| Process killed in background | Notifications stop until reopened — documented v1 limitation |

## Testing

- **Vitest**: URL-handler mapping; `ServerConfig` derivation/override/token-clearing; bearer
  header injection; adapters with mocked `@tauri-apps/*` modules.
- **Guardrail**: new check (same family as `check-ui-purity`) asserting `@tauri-apps/*` imports
  exist only under `src/platform/`.
- **Playwright**: existing e2e suite unchanged — the regression proof that web behavior didn't
  move.
- **Phase 0 (absorbed spike)**: before any adapter work, a bare scaffold on the real device
  verifies WebCrypto (`crypto.subtle`), hash-wasm WASM, IndexedDB persistence, and sync over
  `wss://` from `https://tauri.localhost`.
- **On-device checklist** (run before each release): install signed APK → create account +
  bearer login → bidirectional messaging with a web client → attach media via picker → save an
  attachment → native QR pairing against a second device → App Link tap (cold + warm) →
  notification while backgrounded-alive → server override to a bogus value and back → data
  persists across restart and across an update install.

## Plan-time decisions (not blockers)

1. ~~Distribution channel~~ — resolved at spec review: **GitHub Releases**.
2. Whether `navigator.clipboard` needs the clipboard-manager plugin (verify on device in
   Phase 0).
3. Notification tap → conversation deep-routing (stretch; requires plugin action extras).
