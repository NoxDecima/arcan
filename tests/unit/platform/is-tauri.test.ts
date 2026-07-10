import { describe, it, expect, afterEach } from "vitest";
import { isTauri, isTauriAndroid } from "@/platform/is-tauri";

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
});

describe("isTauri", () => {
  it("is false in a plain browser environment", () => {
    expect(isTauri()).toBe(false);
  });

  it("is true when __TAURI_INTERNALS__ is present", () => {
    (window as any).__TAURI_INTERNALS__ = {};
    expect(isTauri()).toBe(true);
  });
});

describe("isTauriAndroid", () => {
  it("is false outside Tauri even on an Android UA", () => {
    expect(isTauriAndroid()).toBe(false);
  });

  it("is true inside Tauri with an Android UA", () => {
    (window as any).__TAURI_INTERNALS__ = {};
    const original = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36",
      configurable: true,
    });
    expect(isTauriAndroid()).toBe(true);
    Object.defineProperty(navigator, "userAgent", { value: original, configurable: true });
  });
});
