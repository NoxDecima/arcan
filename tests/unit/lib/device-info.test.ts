import { describe, test, expect } from "vitest";
import { deriveDeviceLabel, deriveDeviceOS, relativeTime } from "@/lib/device-info";

describe("deriveDeviceLabel", () => {
  test("recognises Firefox before Safari (UA quirk)", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0";
    expect(deriveDeviceLabel(ua)).toBe("Firefox");
  });
  test("recognises Chrome", () => {
    const ua = "Mozilla/5.0 AppleWebKit Chrome/126.0";
    expect(deriveDeviceLabel(ua)).toBe("Chrome");
  });
  test("falls back to Browser on unknown UA", () => {
    expect(deriveDeviceLabel("random string")).toBe("Browser");
  });
});

describe("deriveDeviceOS", () => {
  test("Mac", () => {
    expect(deriveDeviceOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)")).toBe("macOS");
  });
  test("Linux", () => {
    expect(deriveDeviceOS("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Linux");
  });
  test("Unknown fallback", () => {
    expect(deriveDeviceOS("hello")).toBe("Unknown");
  });
});

describe("relativeTime", () => {
  test("just now for <30s", () => {
    const d = new Date(Date.now() - 5_000);
    expect(relativeTime(d)).toBe("just now");
  });
  test("formats minutes", () => {
    const d = new Date(Date.now() - 5 * 60_000);
    expect(relativeTime(d)).toMatch(/^5m ago$/);
  });
  test("formats hours", () => {
    const d = new Date(Date.now() - 3 * 60 * 60_000);
    expect(relativeTime(d)).toMatch(/^3h ago$/);
  });
  test("returns dash when undefined", () => {
    expect(relativeTime(undefined)).toBe("—");
  });
});
