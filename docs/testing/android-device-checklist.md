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

## Appearance iteration — UI scale + Tokyo Night ladder (2026-07-23)

### UI scale
- [ ] Settings → Appearance → Scale pill shows 4 steps (90 / 100 / 115 / 130%).
      On a fresh install the shell should default to **115%** (Android `defaultUiScale`).
- [ ] Select 130% → content zooms visibly; no horizontal scroll bar / content
      clipped at viewport edge on a real phone screen.
- [ ] Select 90% → nothing clips in the Settings → Appearance card.
- [ ] Change scale → reload / background + foreground app → scale persists at the
      chosen value (localStorage `arcan-ui-scale` survives app lifecycle).
- [ ] Per-message menu (⋮ popover) anchors correctly when scale ≠ 100%: opening it
      at each scale step (90/100/115/130) should position the popover visually
      adjacent to the ⋮ icon, not displaced to a corner.

### Tokyo Night surface ladder
- [ ] Dark theme × any non-default accent: three visually distinct surface levels
      are legible — background (darkest), panel/raised (mid), chrome (lightest /
      header + tab bar). No two adjacent rungs appear identical.
- [ ] Light theme × any non-default accent: same three-rung distinction holds.
- [ ] Own-bubble tint and accent washes look unchanged from before this release
      (no inadvertent re-color from the surface remap).
- [ ] Nav column (left sidebar on tablet/desktop) and tab bar are on the `chrome`
      rung; the conversation list sits on the `panel`/`bg` rung — they look
      visually separated.

## Lightbox image download (#58, 2026-07-23)
- [ ] Open a received image in the lightbox → tap the download button (top
      left) → native save dialog appears; file lands where chosen and opens
      as a valid image (previously the tap silently did nothing — blob-URL
      anchor downloads are broken in the Android WebView; now routed through
      the dialog+fs plugins). Verify from the multi-image lightbox too.

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
