/**
 * Platform QR adapter tests.
 *
 * Uses the vi.doMock recipe from notifications.test.ts:
 * 1. Set __TAURI_INTERNALS__ (+ android UA) to enter the shell branch.
 * 2. vi.doMock the barcode-scanner plugin before re-importing the module.
 * 3. vi.resetModules so the fresh import picks up the mock.
 * 4. vi.doUnmock + cleanup in afterEach.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

// --- helpers ---

function enterTauriAndroid() {
  (window as any).__TAURI_INTERNALS__ = {};
  vi.stubGlobal("navigator", {
    ...navigator,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
  });
}

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
  vi.doUnmock("@tauri-apps/plugin-barcode-scanner");
  vi.resetModules();
  vi.unstubAllGlobals();
});

// --- tests ---

describe("scanQrNative on web (no __TAURI_INTERNALS__)", () => {
  it("returns null without entering the Tauri branch", async () => {
    const { scanQrNative } = await import("@/platform/qr");
    expect(await scanQrNative()).toBeNull();
  });
});

describe("scanQrNative in the Android shell — permission denied", () => {
  it("returns null when permission is denied and cannot be elevated", async () => {
    enterTauriAndroid();
    vi.doMock("@tauri-apps/plugin-barcode-scanner", () => ({
      checkPermissions: vi.fn(async () => "denied"),
      requestPermissions: vi.fn(async () => "denied"),
      scan: vi.fn(),
      Format: { QRCode: "QRCode" },
    }));
    vi.resetModules();
    const { scanQrNative } = await import("@/platform/qr");
    expect(await scanQrNative()).toBeNull();
  });
});

describe("scanQrNative in the Android shell — happy path", () => {
  it("returns the scanned content string when permission is granted", async () => {
    enterTauriAndroid();
    vi.doMock("@tauri-apps/plugin-barcode-scanner", () => ({
      checkPermissions: vi.fn(async () => "granted"),
      requestPermissions: vi.fn(async () => "granted"),
      scan: vi.fn(async () => ({ content: "https://chat.example.com/pair#abc123" })),
      Format: { QRCode: "QRCode" },
    }));
    vi.resetModules();
    const { scanQrNative } = await import("@/platform/qr");
    expect(await scanQrNative()).toBe("https://chat.example.com/pair#abc123");
  });

  it("returns null when the plugin throws (user cancelled)", async () => {
    enterTauriAndroid();
    vi.doMock("@tauri-apps/plugin-barcode-scanner", () => ({
      checkPermissions: vi.fn(async () => "granted"),
      requestPermissions: vi.fn(async () => "granted"),
      scan: vi.fn(async () => { throw new Error("User cancelled"); }),
      Format: { QRCode: "QRCode" },
    }));
    vi.resetModules();
    const { scanQrNative } = await import("@/platform/qr");
    expect(await scanQrNative()).toBeNull();
  });
});
