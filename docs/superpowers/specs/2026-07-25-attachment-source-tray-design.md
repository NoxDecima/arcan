# Attachment-source tray (Android) — design

Date: 2026-07-25
Status: approved (brainstorm)

## Problem

On the Android app, tapping the composer attach button opens a single
undifferentiated picker (`pickFilesNative({ multiple: true })` →
`@tauri-apps/plugin-dialog` `open()`, an all-files document picker). The user
wants to first choose a source — image from gallery, a general file, or (later)
the camera — and then have the matching selector open.

## Scope (brainstorm decisions)

- **Android app only** (`isTauriAndroid()`). Mobile-web PWA and desktop keep
  today's behavior unchanged (direct `pickFilesNative` on Tauri desktop; hidden
  `<input type="file" multiple>` on web). Rejected: all-mobile, everywhere.
- **v1 sources: Photos + File.** **Camera is deferred to a later version**
  (needs a `CAMERA` permission + a native capture path — see the push/notes-
  style follow-up below). The sheet is built so a third "Camera" row drops in
  trivially. Rejected for now: `<input capture>` spike, native capture command.
- Honest tradeoff accepted: a two-row tray adds one tap versus today's single
  picker; the value is the fast image-filtered path ("Photos") plus the
  scaffold for camera.

## Behavior

On the Android app, the attach button opens a bottom sheet instead of calling
the picker directly. The sheet has two rows:

| Row | Icon | Action |
|---|---|---|
| **Photos** | `image` | `pickFilesNative({ imagesOnly: true, multiple: true, maxBytes: MAX_ATTACHMENT_BYTES })` |
| **File** | `paperclip` | `pickFilesNative({ multiple: true, maxBytes: MAX_ATTACHMENT_BYTES })` |

Tapping a row **closes the sheet first, then opens** that picker (so the sheet
isn't lingering behind the native picker). Selected files flow through the
**existing** `ingestFiles` path unchanged (same validation, same 5 MB cap, same
`pending` state, same toasts). "Photos" is the image-filtered document picker
(the existing `imagesOnly` filter) — good enough for v1; a dedicated Android
Photo Picker intent (`ACTION_PICK_IMAGES`) is a possible future enhancement,
not required.

Web/desktop: `handlePickClick` keeps its current path (no sheet).

## Components & wiring

- **New: `src/components/composer-attachment-sheet.tsx`** — a presentational
  component built on the existing `MobileBottomSheet`
  (`src/components/modal-shell.tsx`). Props: `open`, `onClose`, and
  `onPick(source: "photos" | "file")`. Renders the title ("Add attachment") and
  the two rows using the kit `Icon` (`image`, `paperclip`) with the standard
  `tapClass` press feedback. A commented `{/* Camera row — future */}` marker
  sits after the two rows as the insertion point. Dismissal, backdrop, Esc,
  focus-trap, and `role="dialog"` are all inherited from `MobileBottomSheet` —
  no new a11y code.
- **Modify: `src/routes/conversations/detail.tsx`** — add sheet open state
  (`const [attachSheetOpen, setAttachSheetOpen] = useState(false)`). Change the
  attach handler: on `isTauriAndroid()`, open the sheet; otherwise keep the
  current `handlePickClick` behavior verbatim. Add an `onPick` handler that
  closes the sheet and then calls the existing `pickFilesNative` with the
  source-appropriate options, routing the result through the existing
  `ingestFiles` (the same code the current Android path already runs — this is a
  reroute, not a new ingest path). Render `<ComposerAttachmentSheet .../>`
  alongside the existing composer.
- **No changes** to `pickFilesNative` (both variants already exist:
  `imagesOnly` true/false), the schema, capabilities, the manifest, or the
  server.

## Data flow

attach tap (Android) → `setAttachSheetOpen(true)` → sheet row tap →
`onPick(source)` → `setAttachSheetOpen(false)` → `pickFilesNative({ imagesOnly: source==="photos", multiple: true, maxBytes })` → `ingestFiles(files)` → `pending` state → composer tray (unchanged).

## Error handling

Unchanged from today: `pickFilesNative` errors propagate to the existing
try/catch in the attach handler and surface via the current toast; oversize /
empty files are rejected by `isAcceptablePick` with the existing toasts. Sheet
dismissal without a choice is a no-op.

## Testing

- **Component test** (`tests/unit/components/composer-attachment-sheet.test.tsx`):
  renders with `open`, asserts both rows present (Photos, File); clicking each
  calls `onPick` with `"photos"` / `"file"`; clicking backdrop/Esc calls
  `onClose`.
- **Unit test** for the source→options mapping if extracted (photos →
  `imagesOnly: true`; file → `imagesOnly: false`), to pin the wiring without a
  native picker.
- **Device checklist** line (native pickers can't be driven by web e2e): on the
  Android app, attach → sheet appears → "Photos" opens the image picker, "File"
  opens the all-files picker; both attach and send correctly; sheet dismisses on
  backdrop/back.
- Existing web/desktop attachment e2e stays green (their path is untouched);
  verify `check-ui-purity`/`check-tokens` pass (new component uses tokens + kit
  icons only).

## Out of scope

- **Camera capture** (deferred to a later version; needs `CAMERA` permission +
  a native `ACTION_IMAGE_CAPTURE` path via the existing FileProvider, and
  camera-photo downscaling to fit the 5 MB cap). Tracked as a follow-up.
- Mobile-web and desktop trays.
- A dedicated Android Photo Picker (`ACTION_PICK_IMAGES`) intent.
- Any change to the ingest/validation/pending pipeline.

## Batch note

This feature ships in the same implementation round as four captured round-5
fixes (UI-scale zoom-refit bug, composer-tray first-photo bug reopened on
Android, jump-to-latest text label, settings gear icon). They are separate
work items folded into one plan, not part of this spec.
