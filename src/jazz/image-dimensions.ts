/**
 * Read an image file's intrinsic pixel dimensions for upload-time capture
 * (feedback round 5). Uses createImageBitmap (available in the app + Android
 * WebView); never throws — decode failure or non-image → null, and callers
 * upload without dimensions (consumers fall back to fixed layout).
 */
export interface ImageDimensions {
  width: number;
  height: number;
}

export async function readImageDimensions(
  file: File,
): Promise<ImageDimensions | null> {
  if (!file.type.startsWith("image/")) return null;
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close?.();
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}
