/**
 * Downscale an oversized image to fit a byte cap (camera capture, 2026-07-30).
 *
 * Phone camera photos are routinely 3–12 MB and would be rejected by the 5 MB
 * attachment cap — and a user can't "pick a smaller photo" from a camera. This
 * re-encodes an over-cap image (canvas → JPEG), lowering quality then scale
 * until it's under the cap. Under-cap images and non-images pass through
 * untouched. Never throws — on any decode/canvas failure it returns the
 * original file (the ingest size check then applies normally).
 */
export async function downscaleToFit(file: File, maxBytes: number): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= maxBytes) return file;
  if (
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const { width, height } = bitmap;
    let scale = 1;
    let quality = 0.9;

    for (let attempt = 0; attempt < 10; attempt++) {
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
      });
      if (!blob) return file;

      if (blob.size <= maxBytes) {
        const base = file.name.replace(/\.[^.]+$/, "");
        return new File([blob], `${base || "photo"}.jpg`, {
          type: "image/jpeg",
        });
      }

      // Lower quality first (cheap, keeps resolution); then shrink dimensions.
      if (quality > 0.5) quality -= 0.15;
      else scale *= 0.8;
    }

    return file; // couldn't get under the cap — let the ingest size check reject
  } finally {
    bitmap.close?.();
  }
}
