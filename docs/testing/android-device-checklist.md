# Android on-device checklist

Run before each android-v* release tag. Device: real hardware, USB debugging.
Record date + device + result per line.

## Phase 0 — platform assumptions (/diag)
- [ ] Run `npx tauri android init` (first time only) and re-run `npx tauri icon` afterwards — icons initially land in `src-tauri/icons/`; after init they must also be present in the Gradle `res/` dirs that the init generates. Apply Gradle signing wiring per `docs/android-signing.md`.
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
