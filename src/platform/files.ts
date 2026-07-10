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
 * already has a try/catch or error-display path — letting errors propagate
 * means callers' existing "upload failed" toasts and error messages fire
 * exactly as they do today for Jazz errors, with no silent failure.
 */

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  mp4: "video/mp4",
  txt: "text/plain",
};

function inferMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

export interface PickFilesOptions {
  /** Restrict to images (maps to a dialog filter). */
  imagesOnly?: boolean;
  multiple?: boolean;
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
    const bytes = await readFile(path);
    // Android returns content:// URIs; the last segment is the best name
    // we can get without extra native code. Good enough for upload naming.
    const name = decodeURIComponent(path.split("/").pop() ?? "file");
    files.push(new File([new Uint8Array(bytes)], name, { type: inferMime(name) }));
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
