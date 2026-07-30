# Camera capture in the attachment tray (Android) — design

Date: 2026-07-30
Status: approved (brainstorm — decisions locked via AskUserQuestion)

## Problem

The Android attachment sheet (`ComposerAttachmentSheet`, feedback round 6) offers
**Photos** and **File**. The reserved third row — **Take a photo** with the
camera — was deferred (NOX-83 / local follow-up). This adds it.

## Decisions (brainstorm)

- **Native capture** (chosen over a `<input capture>` web spike): launch the
  system camera via `ACTION_IMAGE_CAPTURE` and route the result through the
  existing ingest. Reliable, no dependence on wry's file-chooser honoring the
  `capture` attribute.
- **Downscale** camera photos before ingest so they fit the 5 MB attachment cap
  (`MAX_ATTACHMENT_BYTES`) — phone photos are routinely 3–12 MB.
- Android app only (the sheet is Android-only). No web/desktop camera.

## Mechanism

### Native capture (Kotlin + a Tauri command bridge)

1. **Permission / manifest.** Use `ACTION_IMAGE_CAPTURE` which delegates to the
   installed camera app, so the app itself needs **no** `CAMERA` runtime
   permission (declaring it would, paradoxically, *require* it to be granted —
   so we deliberately do NOT declare `android.permission.CAMERA`). The existing
   `FileProvider` (already configured for downloads, `file_paths.xml`) supplies
   the `EXTRA_OUTPUT` content URI the camera writes to. Add a
   `<queries>`/`ACTION_IMAGE_CAPTURE` entry if targetSdk visibility requires it.
2. **Kotlin (MainActivity).** Register an `ActivityResultLauncher` for
   `ACTION_IMAGE_CAPTURE` (writing to a temp file under the app cache via the
   FileProvider). Expose a suspend/callback entry the Rust command can invoke;
   on result, hand back the temp file path (or a "cancelled" signal).
3. **Rust command.** A `#[tauri::command] capture_photo()` that triggers the
   Kotlin launcher and resolves with the temp file path (or null on cancel).
   Registered in `src-tauri/src/lib.rs` (mobile-only).
4. **JS platform seam.** `src/platform/camera.ts` → `capturePhotoNative():
   Promise<File | null>` — invokes the command, reads the temp file bytes via
   `@tauri-apps/plugin-fs` (same pattern as `pickFilesNative`), sniffs the MIME
   (`sniffImageMime`), builds a `File`, and best-effort deletes the temp file.
   `@tauri-apps/*` imports stay confined to `src/platform/` (purity guard).
5. **Downscale.** `src/jazz/image-downscale.ts` → `downscaleToFit(file, maxBytes)`:
   if `file.size <= maxBytes`, return as-is; else decode via `createImageBitmap`,
   draw to a `<canvas>` at progressively lower scale/JPEG quality until under the
   cap, return a new `File` (`image/jpeg`). Pure-ish (browser canvas APIs);
   unit-testable with a stubbed canvas.
6. **Wire-up.** `ComposerAttachmentSheet` gains a **Camera** row (`camera`
   icon). `detail.tsx` `handlePickSource("camera")` calls `capturePhotoNative()`
   → `downscaleToFit` → existing `ingestFiles` → `nudgeRepaint`-equivalent is
   already handled natively by the round-10 `onResume` invalidate.

### Fallback

If `capturePhotoNative` throws or the plugin is unavailable, surface the
existing composer error toast (no silent failure). Camera row is shown only on
`isTauriAndroid()`.

## Testing

- Unit: `downscaleToFit` (under-cap passthrough; over-cap shrinks below cap;
  non-image passthrough) with a canvas/`createImageBitmap` stub.
- Unit: `ComposerAttachmentSheet` renders the Camera row (extend the existing
  test); `onPick("camera")` fires.
- Device checklist: tap Camera → system camera opens → capture → photo appears
  in the tray (downscaled if large) → send; cancel returns cleanly.
- Native (Kotlin/Rust) can't be driven by web e2e — verified on-device via the
  nightly.

## Out of scope

- Video capture; multi-shot; in-app camera UI (we delegate to the system app).
- iOS (no shell yet).
- Camera on web/desktop.

## Decisions log

- Native `ACTION_IMAGE_CAPTURE` over `<input capture>` spike.
- Downscale to the 5 MB cap (JPEG re-encode) over rejecting large photos.
- No `CAMERA` permission declared (intent delegation).
