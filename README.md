# Arcan

A local-first, end-to-end-encrypted messenger for small trust circles. Built on Jazz/CoJSON.

## Status

E1a Slices 1 and 2 are complete and merged to `main` (tags `slice-1-complete`, `slice-2-complete`). See `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md` for the full design and `docs/superpowers/plans/` for slice-by-slice implementation plans.

## Issue tracking

Followups, design decisions, and known limitations are tracked in Linear:

- **Team:** Nox
- **Project:** Arcan (<https://linear.app/nox-decima/project/arcan-c718904b5ef5>) — renamed from "jazz-messanger" 2026-06-05; the app rebrand itself is tracked as Unit 5 of the 2026-06-05 UI-rework spec.

Items captured via the `followup-tracking` skill during development persist there automatically.

## Development

Requires Node 22+.

```bash
npm install
npm run sync     # in one terminal — local sync server on :4200
npm run dev      # in another — Vite dev server on :5173
```

Tests:

```bash
npm test                  # unit tests via Vitest
npm run test:e2e          # end-to-end tests via Playwright (requires browser binaries installed)
```

To install Playwright browsers (one-time):

```bash
npx playwright install chromium firefox
```

## Android (Tauri shell)

The Android app is a Tauri 2 shell around the same web codebase (`src/platform/` is the only
layer that may import `@tauri-apps/*`). Design: `docs/superpowers/specs/2026-07-09-android-tauri-app-design.md`.

### One-time setup

1. **Toolchain shell** — Android SDK/NDK, JDK, rustup, and Node all come from Nix:

   ```bash
   nix-shell shell.android.nix     # first entry downloads several GB of SDK/NDK
   ```

2. **Rust toolchain + Android targets** (once per machine; persists in `~/.rustup`):

   ```bash
   rustup default stable
   rustup target add aarch64-linux-android armv7-linux-androideabi \
     i686-linux-android x86_64-linux-android
   ```

3. **Dependencies** (inside the shell):

   ```bash
   npm ci && (cd api && npm ci)
   # Native-module ABI: required whenever you switch between nix-shell node
   # and system node ("Module did not self-register" errors otherwise).
   npm rebuild better-sqlite3 && (cd api && npm rebuild better-sqlite3)
   ```

4. **Phone** — enable Developer options (tap Build number 7x), turn on USB debugging,
   plug in, run `adb devices`, and accept the "Allow USB debugging?" prompt on the
   phone. The device must list as `device`, not `unauthorized`.

5. **Tailscale** — the dev loop serves the app over your tailnet via Tailscale Serve
   (real HTTPS cert; WebCrypto requires a secure context). Machine and phone must both
   be signed into the same tailnet with Tailscale active.

The generated Gradle project (`src-tauri/gen/android/`) is committed — no
`tauri android init` needed. If you ever regenerate it: `MainActivity.kt` carries a
custom edge-to-edge insets fix (system bars) that must not be lost.

### Dev loop (one command)

```bash
nix-shell shell.android.nix
npm run android:dev:all
```

Starts sync + auth + `tauri android dev` together: enables/reuses Tailscale Serve for
`:5173`, points the phone's webview at the HTTPS tailnet URL, builds and installs the
app on the connected device, and hot-reloads on `src/` changes. Ctrl-C tears the whole
stack down. `npm run android:dev:all -- --print` shows the resolved env without launching.

Debugging: open `chrome://inspect` in desktop Chrome (phone on USB), inspect the app's
webview; `location.assign("/diag")` runs the on-device platform checks.

### Troubleshooting

- `adb devices` says `unauthorized` — unlock the phone, accept the USB-debugging prompt, replug.
- `EADDRINUSE` on 4200/4300/5173 — another dev stack is running; stop it first.
- `Module did not self-register` (better-sqlite3) — re-run the `npm rebuild` line from inside the shell you are using.
- Release builds and signing: `docs/android-signing.md`. Pre-release device pass: `docs/testing/android-device-checklist.md`.

## Documents

- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans
- `docs/security/threat-model.md` — security threat model
- `docs/jazz-api-notes.md` — jazz-tools 0.20.18 API reference
- `CLAUDE.md` — repo-level project memory consumed by Claude Code sessions
