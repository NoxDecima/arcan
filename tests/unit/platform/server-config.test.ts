import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  getServerOrigin,
  getServerOverride,
  setServerOverride,
  clearServerOverride,
  validateServerOrigin,
  deriveSyncUrl,
  SERVER_OVERRIDE_KEY,
  bakedOrigin,
} from "@/platform/server-config";

function enterTauri() {
  (window as any).__TAURI_INTERNALS__ = {};
}

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe("getServerOrigin", () => {
  it("returns window.location.origin on web, ignoring any override", () => {
    localStorage.setItem(SERVER_OVERRIDE_KEY, "https://other.example");
    expect(getServerOrigin()).toBe(window.location.origin);
  });

  it("returns the baked VITE_ARCAN_ORIGIN in the shell", () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    expect(getServerOrigin()).toBe("https://chat.meteory.eu");
  });

  it("prefers a stored override in the shell", () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    localStorage.setItem(SERVER_OVERRIDE_KEY, "https://other.example");
    expect(getServerOrigin()).toBe("https://other.example");
  });

  it("falls back to the placeholder origin in the shell when no env is baked", () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "");
    expect(getServerOrigin()).toBe("https://arcan.example");
  });
});

describe("bakedOrigin", () => {
  it("strips a trailing slash from the env value", () => {
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu/");
    expect(bakedOrigin()).toBe("https://chat.meteory.eu");
  });

  it("falls back to the placeholder when given a schemeless value", () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "localhost:3000");
    expect(getServerOrigin()).toBe("https://arcan.example");
  });
});

describe("validateServerOrigin", () => {
  it("returns the normalized https origin for a valid URL", () => {
    expect(validateServerOrigin("https://chat.example.com")).toBe("https://chat.example.com");
  });

  it("strips a trailing slash and path when normalizing", () => {
    expect(validateServerOrigin("https://other.example/")).toBe("https://other.example");
    expect(validateServerOrigin("https://other.example/some/path")).toBe("https://other.example");
  });

  it("throws the full-URL message for a schemeless/unparseable value", () => {
    expect(() => validateServerOrigin("not a url")).toThrow("Enter a full URL, e.g. https://chat.example.com");
  });

  it("throws the https message for an http:// URL", () => {
    expect(() => validateServerOrigin("http://insecure.example")).toThrow(
      "Server must be reachable over https://",
    );
  });

  it("throws the https message for a non-http scheme", () => {
    expect(() => validateServerOrigin("ftp://files.example")).toThrow(/https/);
  });
});

describe("setServerOverride", () => {
  it("persists a valid https origin (normalized, no trailing slash)", () => {
    enterTauri();
    setServerOverride("https://other.example/");
    expect(getServerOverride()).toBe("https://other.example");
  });

  it("rejects non-https origins", () => {
    enterTauri();
    expect(() => setServerOverride("http://insecure.example")).toThrow(/https/);
    expect(() => setServerOverride("not a url")).toThrow(/full URL/);
  });

  it("throws dialog-grade copy when storage writes fail", () => {
    enterTauri();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => setServerOverride("https://other.example")).toThrow(/storage is unavailable/);
    spy.mockRestore();
  });

  it("clearServerOverride removes the stored value", () => {
    enterTauri();
    setServerOverride("https://other.example");
    clearServerOverride();
    expect(getServerOverride()).toBeNull();
  });
});

describe("deriveSyncUrl", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SYNC_URL", "");
  });

  it("uses VITE_SYNC_URL verbatim when set", () => {
    vi.stubEnv("VITE_SYNC_URL", "ws://192.168.1.42:4200");
    expect(deriveSyncUrl()).toBe("ws://192.168.1.42:4200");
  });

  it("derives wss://<host>/sync/ from an https server origin in the shell", () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");
    expect(deriveSyncUrl()).toBe("wss://chat.meteory.eu/sync/");
  });

  it("derives from window.location on web (existing behavior)", () => {
    expect(deriveSyncUrl()).toBe(`ws://${window.location.host}/sync/`);
  });
});
