# Camera capture in the attachment tray (Android) — design

Date: 2026-07-30
Status: approved (brainstorm — decisions locked via AskUserQuestion)

## Problem

The Android attachment sheet (`ComposerAttachmentSheet`, feedback round 6) offers
**Photos** and **File**. The reserved third row — **Take a photo** with the
camera — was deferred (NOX-83 / local follow-up). This adds it.

## Decisions (brainstorm + research revision)

- **Native capture via the WebView's `<input capture>`** — research (2026-07-30)
  revised the mechanism. The original plan was a Kotlin/Rust
  `ACTION_IMAGE_CAPTURE` bridge; research found that **wry itself already fires
  `MediaStore.ACTION_IMAGE_CAPTURE`** from `onShowFileChooser` when a
  `<input accept="image/*" capture="environment">` is clicked (wry PR #685,
  present in this repo's exact `wry 0.55.1` / `tauri 2.11.5` per `Cargo.lock`),
  and `CAMERA` permission is already merged into the app manifest via the
  `tauri-plugin-barcode-scanner` AAR. So this IS native capture — with **zero
  Kotlin, zero Rust, zero new deps, zero manifest edits** — dramatically lower
  risk than a hand-rolled plugin (which can't be built/verified locally).
  Rejected: the Kotlin `@TauriPlugin` bridge and the raw-JNI command (both
  high blind-build risk); a community camera plugin (immature).
- **Downscale** camera photos before ingest so they fit the 5 MB attachment cap
  (`MAX_ATTACHMENT_BYTES`) — phone photos are routinely 3–12 MB, and the ingest
  size check would otherwise reject them.
- Android app only (the sheet is Android-only). No web/desktop camera row.

## Mechanism

### WebView `<input capture>` (the wry-native camera path)

The captured photo arrives via the input's **DOM `onChange`** (`e.target.files`),
NOT via `pickFilesNative` — the current Android attach path routes to
`pickFilesNative` (dialog+fs), which bypasses the input; wry's camera fires only
from the WebView `<input>`'s own click. So the Camera source must click a
dedicated `<input capture>` and let its `onChange` deliver the `File`.

1. **Dedicated hidden input.** In `detail.tsx`, add alongside the existing
   file input a second: `<input ref={cameraInputRef} type="file"
   accept="image/*" capture="environment" className="hidden"
   onChange={handleCameraCapture} />`.
2. **Camera source branch.** `ComposerAttachmentSheet` gains a **Camera** row
   (`camera` icon, Android-only sheet). `detail.tsx` `handlePickSource("camera")`
   calls `cameraInputRef.current?.click()` and returns — it does NOT call
   `pickFilesNative` for the camera source.
3. **Capture handler + downscale.** `handleCameraCapture(e)` reads
   `e.target.files`, runs each image through `downscaleToFit` (below), then
   `ingestFiles`, and resets `e.target.value`. Downscaling BEFORE `ingestFiles`
   matters — a raw camera photo often exceeds the 5 MB cap and would be rejected
   by `isAcceptablePick`; the user can't "pick a smaller photo" from a camera.
4. **Downscale util.** `src/jazz/image-downscale.ts` → `downscaleToFit(file, maxBytes)`:
   if `file.size <= maxBytes` or non-image → return as-is; else decode via
   `createImageBitmap`, draw to a `<canvas>` at progressively lower scale/JPEG
   quality until under the cap, return a new `image/jpeg` `File`. Uses browser
   canvas APIs; unit-tested with stubs.
5. **FileProvider hardening (proactive).** Add
   `<external-files-path name="my_capture" path="Pictures" />` to
   `src-tauri/gen/android/app/src/main/res/xml/file_paths.xml` — wry writes the
   temp capture under `getExternalFilesDir(DIRECTORY_PICTURES)`, and the current
   `file_paths.xml` lacks that root; harmless if unused, prevents a possible
   on-device `Failed to find configured root`.

No Rust, no Kotlin, no capability/permission edits (CAMERA already merged via
barcode-scanner; FileProvider already declared). Round-10 `onResume` WebView
invalidate already covers the post-capture repaint.

### Fallback

If the capture yields no file (user cancels) it's a no-op. If `downscaleToFit`
throws (decode failure), fall back to ingesting the original file (the ingest
size check then applies its normal reject-with-toast). Camera row is shown only
on `isTauriAndroid()`.

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
