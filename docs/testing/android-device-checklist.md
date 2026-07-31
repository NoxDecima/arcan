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

## Nightly channel
- [ ] Nightly channel: sideload a nightly APK over the installed stable (same versionCode replace) and back to the next stable — both transitions succeed without uninstall.

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
      NOTE: superseded by the round-5 direct-to-Downloads behavior below —
      the save dialog is now only a fallback (Android 10 / write failure).

## Feedback round 5 (2026-07-24)
- [ ] Night ladder: dark theme reads noticeably deeper than the previous
      nightly; chrome (headers, sidebar, composer bar) sits DARKER than the
      chat canvas; bubbles/cards read as raised above the canvas. Light theme
      looks unchanged.
- [ ] Pinch-zoom and double-tap zoom do NOTHING anywhere in the app (viewport
      is locked). Confirm on the timeline, an image, and the settings screen.
- [ ] Settings → tap the UI-scale pill through 90/100/115/130 — size changes
      without the page visibly zooming/jumping around the tap point.
- [ ] Lightbox download AND the file-attachment download button land the file
      directly in the device Downloads folder (visible in Files → Downloads)
      with a "Saved to Downloads" toast — NO save-location dialog.
- [ ] Add a single photo to the composer → it appears in the tray immediately
      (no need to add a second attachment to make the first show).
- [ ] Open a conversation that has image history → the view lands at the
      bottom (newest), not stranded mid-history, even as images finish loading
      and change heights.
- [ ] Scroll up while new messages arrive (send from another device) → the
      view stays put and a jump-to-latest chevron with a count appears above
      the composer; tap it → smooth-scrolls to newest and the button hides.
- [ ] Multi-portrait image message: the bubble is taller (not squashed square);
      a single portrait/landscape image hugs its true shape without a dead
      strip. Legacy pre-round-5 image messages still render (fixed squares).
- [ ] Edit a long (multi-line) message → the edit box grows to multiple lines;
      Shift+Enter inserts a newline, Enter saves, Escape cancels.

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

## Feedback round 6 (2026-07-25)
- [ ] UI scale: at 90% the app still fills the screen edge-to-edge (no empty
      margin); at 130% it fills without horizontal/vertical page scrolling.
      Every step (90/100/115/130) refits.
- [ ] Jump-to-latest button reads "jump to latest" (text), not a number.
- [ ] Settings gear icon looks like a clean, well-defined gear at nav sizes.
- [ ] Attach → a bottom sheet appears with "Photos", "File", and "Camera";
      "Photos" opens the image picker, "File" opens the all-files picker; both
      attach + send; the sheet dismisses on backdrop tap / back.
- [ ] (#79) Adding a single photo shows it in the tray immediately — no need to
      add a second. If still broken, check whether the console shows
      "[composer] ingested 1 pending now grows".

## Markdown messages (2026-07-30)
- [ ] Composer is multi-line: Shift+Enter inserts a newline, Enter sends; the
      box grows with the text then scrolls.
- [ ] Send `# Heading`, `- bullet`, `- [ ] todo`, `**bold**`, `` `code` ``, a
      link, and a `> quote` (each on its own line) → the sent bubble renders
      them formatted (heading, bulleted list, a checkbox, bold, code, a link,
      a quote bar).
- [ ] The task checkbox is NOT tappable (display-only).
- [ ] Tapping a link opens it in the browser.
- [ ] Long-press on your own markdown message still opens the edit/delete menu;
      choosing Edit shows the RAW markdown (not the rendered version).
- [ ] A plain-text message (no markdown) still looks normal.

## Camera capture (#83, 2026-07-30)
- [ ] Attach → bottom sheet → "Camera" opens the **live system camera** (NOT
      the gallery picker). This was the reported bug: the fix adds a `<queries>`
      for `ACTION_IMAGE_CAPTURE` so wry's `resolveActivity` finds the camera app
      on Android 11+ instead of silently falling back to the gallery.
- [ ] Take a photo → confirm → the photo lands in the composer tray (as a
      pending attachment) → send → it appears in the conversation.
- [ ] Cancelling the camera (back out without a shot) returns to the chat
      cleanly with no pending attachment and no error toast.
- [ ] A large capture (multi-MB) still sends — it's downscaled to fit the 5 MB
      cap rather than being rejected with "too large".
- [ ] After returning from the camera, the WebView repaints (no blank/frozen
      screen — the round-10 onResume invalidate covers this).

## Camera/composer follow-ups (2026-07-31, on-device round 3)
- [ ] Camera → take a photo → confirm → the photo **appears in the composer
      tray** as a pending attachment (round 2 fixed opening the camera; this
      fixes the captured photo not attaching). If it still fails, check logcat
      for `[camera] capture onChange — N file(s)` to see if the handler ran.
- [ ] Type a multi-line message, send it → the composer **shrinks back to one
      line** (previously stayed tall).
- [ ] While typing multiple lines, the text has **readable line spacing** (not
      crushed together).

## Camera/tray/newline follow-ups (2026-07-30, on-device round 2)
- [ ] **Camera opens the camera** (see the fixed item above) — this is the
      headline check for this round.
- [ ] Attachment sheet lays the three sources out **horizontally** (Camera /
      Photos / File as a row of icon-over-label buttons), not a vertical list.
- [ ] In the composer, the phone keyboard's **Enter inserts a newline** (return
      key), it does NOT auto-send. You send with the send button. This lets you
      type multi-line markdown (lists/headings) on the phone.
- [ ] The keyboard's bottom-right action key shows a **return/newline** glyph,
      not a "send"/"go" glyph.
