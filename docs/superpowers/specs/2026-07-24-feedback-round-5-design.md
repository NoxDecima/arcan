# Feedback round 5 — Night ladder, chat scroll & attachments, zoom lock, Downloads saving

Date: 2026-07-24
Status: approved (visual-companion brainstorm; dark-ladder mockups archived in
`.superpowers/brainstorm/2115603-1784901510/content/`)

## Scope

Eight items from the 2026-07-24 walkthrough of `nightly-2026-07-24`. One slice,
one `--no-ff` merge, followed by a fresh nightly for on-device judgment before
any stable release.

## 1. Dark ladder → Night (one rung darker)

User verdict on the shipped Storm ladder: layering is right, hue is right,
**too light** — the deep dark is gone. Chosen variant (brainstorm card "A —
Night"): shift every dark rung one step darker; the chat canvas becomes the
canonical Tokyo Night editor background.

Token remap (dark block of `src/styles/tokens.css` ONLY — light mode, all
text tokens, and all accent blocks untouched):

| Token | Storm (now) | Night (new) |
|---|---|---|
| `--color-bg-stage` | `#16161e` | `#101014` |
| `--color-rail` | `#16161e` | `#101014` |
| `--color-chrome` | `#1a1b26` | `#16161e` |
| `--color-bg` (canvas) | `#1f2335` | `#1a1b26` |
| `--color-panel` (raised) | `#292e42` | `#24283b` |
| `--color-panel-2` (raised-2) | `#414868` | `#343a55` |
| `--color-border` | `#3b4261` | `#2f3549` |

Follow-through (lessons from the appearance slice):

- `tests/parity/proto-cells.jsx` `ladderSkin()` bakes the dark hexes — apply
  the identical remap there (proto consumes skin() hexes, not CSS vars).
  Target stays 142/142.
- PWA manifest colors follow the ladder: `theme_color` → `#16161e` (chrome),
  `background_color` → `#101014` (stage). Also any `theme-color` meta in
  `index.html` and baked Android shell colors (`src-tauri/gen/android`
  splash/status-bar values, if any) — the plan verifies with a repo-wide grep
  for the old hexes, including `public/`.

## 2. Mobile zoom lock

`index.html` viewport meta gains `maximum-scale=1.0, user-scalable=no`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

This kills pinch-zoom and double-tap zoom app-wide (Android WebView + mobile
browsers) — the root of "the screen ends up zoomed in when changing scale":
double-tapping the scale pill could trigger WebView double-tap zoom on top of
the CSS zoom. The in-app UI-scale setting is the sanctioned zoom; scale-step
changes stay instant (no animation — re-layout is inherent to CSS `zoom`).
No `touch-action` CSS changes this round.

## 3. Image dimensions at upload (schema)

`src/jazz/schema/FileBlob.ts` gains optional intrinsic-dimension fields:

- `width: z.number().optional()`
- `height: z.number().optional()`

Captured at attach time in the attachment-ingest path (`src/jazz/attachments.ts`)
for `image/*` files via `createImageBitmap` (fallback: `Image` decode).
Optional forever per Jazz migration doctrine (required-field validation runs
before backfill visibility); legacy attachments simply lack them and hit the
fallbacks below. No migration needed.

## 4. Aspect-aware multi-image grid

`src/components/message-attachments.tsx` stops forcing squares:

- Cell aspect ratio derives from the member images' intrinsic ratios,
  **clamped to [3:4 … 4:3]** — portrait pairs get visibly taller bubbles;
  one extreme panorama can't blow up the layout.
- 2-col rows use the average of the two members' clamped ratios, then clamp
  again. The 3-image / odd-expanded hero cell (full width) clamps to
  [2:1 … 4:3].
- The 4+ collapse and "+N" scrim behavior is unchanged.
- Any image without stored dimensions in the set → that row falls back to
  today's fixed ratios (squares / 2:1 hero).
- Single images keep the existing true-ratio hug; their loading placeholder
  (`attachment-tile.tsx`, currently fixed `w-48 h-32`) reserves the exact
  final box via `style={{ aspectRatio: width/height }}` when dimensions exist.

## 5. Open at the bottom, reliably

Root cause (investigated): the one-shot `scrollTop` positioning in
`src/routes/conversations/detail.tsx` runs at mount, then late-loading image
blobs replace small placeholders and shift the layout.

Two layers:

1. **Reservation** — §3/§4 placeholders match final rendered size, so new
   attachments cause no shift at all.
2. **Re-anchoring** — a `ResizeObserver` on the timeline content re-runs the
   existing `position()` routine (bottom, or unread-divider target) whenever
   content growth changes `scrollHeight` — until the first **user-initiated**
   scroll, which permanently hands control to the user for that conversation
   visit. Programmatic scrolls are flagged so they don't count as user scrolls.
   This covers legacy dimension-less attachments and any other late layout
   (fonts, avatars).

## 6. Jump-to-latest + auto-scroll behavior fix

Behavior change (approved): stop force-scrolling on every incoming message.

- Track `isNearBottom` via a scroll listener on the timeline (threshold
  ~120px, document-space `scrollTop` math — no zoom division needed).
- New message while near bottom → smooth auto-scroll (as today).
- New message while scrolled up → **view stays put**; a floating
  jump-to-latest button appears with a count badge of messages arrived since
  scrolling away (reuses the badge pop animation). Tap → smooth scroll to
  bottom, count resets. Reaching the bottom by hand also resets it.
- Placement: zero-height `relative` wrapper between timeline and composer
  (the `SyncStatusPill` pattern) — no portal, no zoom math. Circular chrome
  button with a chevron-down `Icon`, styled from existing kit vocabulary.
- Purity: the button is a presenter piece (prop slot on the chat screen
  presenter, e.g. `jumpToLatest={{ visible, count, onClick }}`); state and
  wiring live in `detail.tsx`. Testids for e2e.

## 7. Multi-line message edit

The edit field in `detail.tsx` (currently a fixed-height single-line
`<input>`) becomes an auto-growing `<textarea>`:

- Grows with content (scrollHeight-driven) up to ~6 lines (`max-h` cap),
  then scrolls internally. `resize-none`, `leading-normal` (the current
  `leading-none` cannot render multi-line text properly).
- Keys: **Enter saves, Shift+Enter inserts a newline, Escape cancels.**
  Save/cancel buttons unchanged.
- The main composer stays single-line this round (deliberate; parity is a
  possible follow-up).

## 8. Android: download straight to Downloads

`src/platform/files.ts` — on the Android Tauri shell, `saveBlobNative` writes
directly to the public Downloads collection instead of opening the save
dialog:

- `writeFile("Download/<collision-safe-name>", bytes, { baseDir: BaseDirectory.Home })`
  → `/storage/emulated/0/Download/…`. On Android 11+ this needs **no
  permissions and no dialog** (scoped-storage contribution of new files);
  research verified Tauri's `BaseDirectory.Download` is an app-scoped trap on
  Android and must not be used.
- Collision-safe name: timestamp suffix before the extension — do NOT trust
  `exists()` (other apps' same-named files are invisible but still block
  creation).
- Capability: `src-tauri/capabilities/mobile.json` gains
  `fs:allow-write-file` scoped to `$HOME/Download/**` (Android-only stays
  Android-only).
- Failure of the direct write (e.g. Android 10) → falls back to the existing
  save-dialog path. Web anchor download unchanged. Future desktop Tauri keeps
  the dialog (gate on the Android platform check).
- `downloadBlob` returns an outcome so call sites (lightbox +
  attachment-tile) can toast "Saved to Downloads" on the direct path; the
  platform layer itself stays toast-free.

## 9. Attachment-tray first-photo bug

"Sometimes the first added photo doesn't show in the tray until a second is
added." A race — root-caused during implementation with the
systematic-debugging skill, not guessed at. Starting hypotheses from the
investigation (ranked): `attachSlot` JSX identity / tray remount interaction
with `PendingPreview`'s object-URL state; preview effect timing on the native
(Tauri picker) ingest path. The fix ships with a regression test that fails
before and passes after; if no repro is achievable in a test harness, the fix
must at minimum be exercised by a component test of the tray's
single-attachment render path.

## Verification

- Full sweep: `typecheck`, `check-tokens`, `check-ui-purity`,
  `check-platform-purity`, vitest, parity 142/142, both e2e projects (halved
  runs, `--workers=2`).
- New/updated tests: jump-to-latest e2e (scroll up → send from second client →
  button + badge, no yank; tap → bottom); multi-line edit e2e (Shift+Enter
  newline survives save); unit tests for aspect-clamp math and the
  collision-safe filename; tray regression test (§9); ui-scale e2e re-run
  (viewport meta change must not break it).
- Grep-verify no old dark hexes remain (incl. `public/`, manifest, index.html).
- `docs/testing/android-device-checklist.md` gains: Night ladder pass, pinch/
  double-tap dead, scale-pill double-tap no longer zooms, lightbox +
  attachment download land in Downloads with toast, tray single-photo attach,
  conversation opens at bottom with image history, jump button behavior.
- Post-merge: fresh `nightly-*` tag (user-confirmed) for on-device judgment
  of Night before any stable release.

## Out of scope

- Composer multi-line parity (offered; user can pull it into a later round).
- Offline-indicator redesign (still deferred from 2026-07-23).
- Light-theme ladder changes; text/accent recolors.
- In-app nightly identification; `touch-action` sweeps.

## Decisions log (2026-07-24 brainstorm)

- Dark theme verdict: layering + hue right, anchor too light → variant
  **A — Night** (one rung darker) over B — Midnight (two rungs), C — Deep
  (pre-ladder near-black), and keeping Storm.
- Zoom lock via viewport meta over `touch-action` CSS.
- Auto-scroll-on-new-message demoted to near-bottom-only (prerequisite for a
  meaningful jump-to-latest button).
- Downloads via raw-path `$HOME/Download/` write (zero new deps) over
  `tauri-plugin-android-fs` (held in reserve if raw-path misbehaves) and a
  custom JNI/MediaStore command.
- Edit keys: Enter saves / Shift+Enter newline (Slack convention) over
  Ctrl+Enter saves.
