import { describe, it, expect, afterEach, vi } from "vitest";
import { pickFilesNative, saveBlobNative, sniffImageMime, inferMime } from "@/platform/files";

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
  vi.restoreAllMocks();
});

describe("files adapter on web", () => {
  it("pickFilesNative returns null (caller falls back to <input type=file>)", async () => {
    expect(await pickFilesNative({ multiple: true })).toBeNull();
  });

  it("saveBlobNative returns false (caller falls back to anchor download)", async () => {
    expect(await saveBlobNative(new Blob(["x"]), "x.txt")).toBe(false);
  });
});

describe("sniffImageMime", () => {
  it("recognizes PNG magic bytes (89 50 4E 47)", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffImageMime(bytes)).toBe("image/png");
  });

  it("recognizes JPEG magic bytes (FF D8 FF)", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffImageMime(bytes)).toBe("image/jpeg");
  });

  it("recognizes GIF magic bytes (47 49 46 38)", () => {
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(sniffImageMime(bytes)).toBe("image/gif");
  });

  it("recognizes WebP magic bytes (RIFF....WEBP)", () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // file size (placeholder)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(sniffImageMime(bytes)).toBe("image/webp");
  });

  it("returns null for unrecognized bytes", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
    expect(sniffImageMime(bytes)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(sniffImageMime(new Uint8Array([]))).toBeNull();
  });
});

describe("inferMime", () => {
  it("maps heic to image/heic", () => {
    expect(inferMime("photo.heic")).toBe("image/heic");
  });

  it("maps heif to image/heif", () => {
    expect(inferMime("photo.heif")).toBe("image/heif");
  });

  it("falls back to application/octet-stream for unknown extension", () => {
    expect(inferMime("archive.xyz")).toBe("application/octet-stream");
  });

  it("falls back to application/octet-stream for extension-less name", () => {
    expect(inferMime("noextension")).toBe("application/octet-stream");
  });
});

describe("pickFilesNative in the shell", () => {
  it("sniffs MIME from PNG magic bytes for extension-less Android content:// paths", async () => {
    (window as any).__TAURI_INTERNALS__ = {};

    // PNG magic bytes
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

    vi.doMock("@tauri-apps/plugin-dialog", () => ({
      open: vi.fn().mockResolvedValue("/picker/123"),
    }));
    vi.doMock("@tauri-apps/plugin-fs", () => ({
      readFile: vi.fn().mockResolvedValue(pngBytes),
      stat: vi.fn().mockResolvedValue({ size: pngBytes.byteLength }),
    }));

    vi.resetModules();
    const { pickFilesNative: pick } = await import("@/platform/files");

    const files = await pick({ imagesOnly: true, multiple: false, maxBytes: 5 * 1024 * 1024 });

    expect(files).not.toBeNull();
    expect(files!.length).toBe(1);
    expect(files![0].type).toBe("image/png");

    vi.doUnmock("@tauri-apps/plugin-dialog");
    vi.doUnmock("@tauri-apps/plugin-fs");
    delete (window as any).__TAURI_INTERNALS__;
  });
});
