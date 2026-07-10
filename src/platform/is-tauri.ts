/**
 * Platform detection for the Tauri shell.
 *
 * `__TAURI_INTERNALS__` is injected by the Tauri runtime into every webview
 * it hosts (v2). Its absence means we're a plain browser tab / PWA.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Android-specific shell detection — used where the capability only exists
 * on mobile (e.g. the native barcode-scanner plugin).
 */
export function isTauriAndroid(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent);
}
