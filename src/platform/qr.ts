import { isTauriAndroid } from "./is-tauri";

/**
 * Native QR scan (Android shell only — the plugin has no desktop support).
 * Returns the decoded string, or null if the user cancelled / denied.
 * Web + desktop keep the qr-scanner getUserMedia path in src/qr/scanner.tsx.
 */
export function nativeQrAvailable(): boolean {
  return isTauriAndroid();
}

export async function scanQrNative(): Promise<string | null> {
  if (!isTauriAndroid()) return null;
  const { scan, Format, checkPermissions, requestPermissions } = await import(
    "@tauri-apps/plugin-barcode-scanner"
  );
  let permission = await checkPermissions();
  if (permission !== "granted") {
    permission = await requestPermissions();
  }
  if (permission !== "granted") return null;
  try {
    const result = await scan({ windowed: false, formats: [Format.QRCode] });
    return result.content || null;
  } catch (err) {
    console.warn("[qr]", err);
    // Plugin throws on cancel — treat as "no scan".
    return null;
  }
}
