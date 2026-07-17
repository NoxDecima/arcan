# Android on-device checklist

Run before each android-v* release tag. Device: real hardware, USB debugging.
Record date + device + result per line.

## Phase 0 — platform assumptions (/diag)
- [~] Run `npx tauri android init` (first time only) and re-run `npx tauri icon` afterwards — icons initially land in `src-tauri/icons/`; after init they must also be present in the Gradle `res/` dirs that the init generates. Apply Gradle signing wiring per `docs/android-signing.md`. *(2026-07-13, Fairphone 5 5G: init done; icons still placeholder, signing wiring pending — release prep, not dev blockers)*
- [x] /diag: secure context PASS *(2026-07-13, Fairphone 5 5G, dev build via Tailscale Serve)*
- [x] /diag: WebCrypto PASS *(2026-07-13, Fairphone 5 5G)*
- [x] /diag: WASM (argon2id) PASS *(2026-07-13, Fairphone 5 5G)*
- [x] /diag: IndexedDB write PASS *(2026-07-13, Fairphone 5 5G)*
- [x] /diag: sync WebSocket PASS *(2026-07-13, Fairphone 5 5G — wss via Tailscale Serve → Vite proxy → local sync; real deployment still to be tested)*

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

## Feedback round 3 (2026-07-15)
- [ ] "scan their QR code" (add contact) opens the native camera scanner
      immediately — no intermediate button screen
- [ ] Device pairing responder scan also opens the camera immediately
- [ ] Cancelling the native scanner shows "scan again" + paste field; the
      camera does NOT relaunch on its own
- [ ] "or paste a link" reveals an inline text field; pasting an invite URL
      opens the accept flow (no browser dialog)
- [ ] Header back from a contact's profile lands on the contacts tab; no
      back-and-forth loop between conversation and profile
- [ ] Feedback submit succeeds against a token-configured server; shows
      "feedback isn't set up on this server" against an unconfigured one

## Feedback round 4 (2026-07-17)
- [ ] Timestamps render below bubbles (right-aligned own, left-aligned theirs);
      edited messages show "HH:MM · edited"
- [ ] A wide image stays inside its bubble on the phone screen
- [ ] Editing a message: the input fits inside the bubble, save/cancel reachable
- [ ] Long-press (~0.5s) on an own message opens the edit/delete popover
- [ ] Scrolling the timeline with a finger over an own message does NOT open it
- [ ] Tap-away closes the popover; edit and delete both work from it
- [ ] Desktop web: right-click on an own message opens the same popover;
      right-click elsewhere keeps the browser's native context menu
