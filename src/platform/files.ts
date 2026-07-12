import { isTauri } from "./is-tauri";

/**
 * File pick/save adapters.
 *
 * Contract: on web both functions are no-ops (null/false) and the caller
 * keeps its existing DOM path (<input type=file> / anchor download). This
 * keeps Playwright's setInputFiles and browser behavior untouched.
 *
 * In the shell, <input type=file> does not open a picker and <a download>
 * on blob: URLs silently does nothing (wry limitations) — the dialog + fs
 * plugins are the supported path.
 *
 * Error propagation: pickFilesNative and saveBlobNative propagate plugin
 * errors to callers. Every call site (avatar handlers, ingestFiles, download)
 * MUST wrap in try/catch and surface via its existing error affordance
 * (avatarError state, toast, composerError, etc.) — letting errors propagate
 * means callers' existing "upload failed" toasts and error messages fire
 * exactly as they do today for Jazz errors, with no silent failure.
 */

export const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  mp4: "video/mp4",
  txt: "text/plain",
};

export function inferMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

/**
 * Sniff image MIME type from the first bytes of a file.
 *
 * Android gallery picks are extension-less content:// URIs; sniffing rescues
 * the inline-image flow by identifying the true type from magic bytes rather
 * than depending on a file extension that may not exist.
 *
 * Returns null when the bytes don't match a known signature.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  // PNG: 89 50 4E 47
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  // GIF: 47 49 46 38 (GIF8)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  // WebP: RIFF....WEBP — 52 49 46 46 at offset 0, 57 45 42 50 at offset 8
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export interface PickFilesOptions {
  /** Restrict to images (maps to a dialog filter). */
  imagesOnly?: boolean;
  multiple?: boolean;
  /**
   * Optional size cap in bytes. When provided, each file is stat-checked
   * before reading — if it exceeds the cap, an Error is thrown WITHOUT
   * reading the bytes. Best-effort: if stat throws, the read proceeds.
   */
  maxBytes?: number;
}

export async function pickFilesNative(
  opts: PickFilesOptions,
): Promise<File[] | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readFile } = await import("@tauri-apps/plugin-fs");

  const selection = await open({
    multiple: opts.multiple ?? false,
    filters: opts.imagesOnly
      ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
      : undefined,
  });
  if (selection === null) return [];
  const paths = Array.isArray(selection) ? selection : [selection];

  const files: File[] = [];
  for (const path of paths) {
    // Size pre-check — best-effort: if stat is unavailable (older plugin
    // version, permissions), proceed directly to read.
    if (opts.maxBytes !== undefined) {
      try {
        const { stat } = await import("@tauri-apps/plugin-fs");
        const info = await stat(path);
        if (info.size > opts.maxBytes) {
          const limitMB = Math.round(opts.maxBytes / 1024 / 1024);
          throw new Error(`file is larger than the ${limitMB} MB limit`);
        }
      } catch (e) {
        // Re-throw only our own size-limit error; swallow plugin/stat errors.
        if (e instanceof Error && e.message.includes("MB limit")) throw e;
        // stat unavailable — fall through to read
      }
    }

    const bytes = await readFile(path);
    // Android returns content:// URIs; the last segment is the best name
    // we can get without extra native code. Good enough for upload naming.
    const name = decodeURIComponent(path.split("/").pop() ?? "file");
    // Prefer magic-byte sniffing so extension-less Android content:// URIs
    // get the correct MIME type for inline-image rendering.
    const type = sniffImageMime(new Uint8Array(bytes)) ?? inferMime(name);
    files.push(new File([new Uint8Array(bytes)], name, { type }));
  }
  return files;
}

/** Returns true if the shell handled the save; false → caller uses anchor. */
export async function saveBlobNative(
  blob: Blob,
  filename: string,
): Promise<boolean> {
  if (!isTauri()) return false;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeFile } = await import("@tauri-apps/plugin-fs");

  const path = await save({ defaultPath: filename });
  if (!path) return true; // user cancelled — handled, don't anchor-download
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile(path, bytes);
  return true;
}
