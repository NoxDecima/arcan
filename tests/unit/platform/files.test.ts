import { describe, it, expect, afterEach, vi } from "vitest";
import {
  pickFilesNative,
  saveBlobNative,
  downloadBlob,
  sniffImageMime,
  inferMime,
} from "@/platform/files";

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("files adapter on web", () => {
  it("pickFilesNative returns null (caller falls back to <input type=file>)", async () => {
    expect(await pickFilesNative({ multiple: true })).toBeNull();
  });

  it("saveBlobNative returns false (caller falls back to anchor download)", async () => {
    expect(await saveBlobNative(new Blob(["x"]), "x.txt")).toBe(false);
  });

  it("downloadBlob falls back to a programmatic anchor download (#58)", async () => {
    // jsdom has no createObjectURL — stub the pair on the real URL global.
    const createObjectURL = vi.fn(() => "blob:test-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));

    let clicked: HTMLAnchorElement | null = null;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked = this;
      });

    await downloadBlob(new Blob(["x"], { type: "image/png" }), "pic.png");

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(clicked!.getAttribute("download")).toBe("pic.png");
    expect(clicked!.getAttribute("href")).toBe("blob:test-url");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
    // Anchor is removed again after the click.
    expect(clicked!.isConnected).toBe(false);
  });
});

describe("downloadBlob in the shell (#58)", () => {
  it("routes through the native save dialog + fs write, never the anchor", async () => {
    (window as any).__TAURI_INTERNALS__ = {};

    const save = vi.fn().mockResolvedValue("/downloads/pic.png");
    const writeFile = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@tauri-apps/plugin-dialog", () => ({ save }));
    vi.doMock("@tauri-apps/plugin-fs", () => ({ writeFile }));

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    vi.resetModules();
    const { downloadBlob: dl } = await import("@/platform/files");
    await dl(new Blob(["png-bytes"], { type: "image/png" }), "pic.png");

    expect(save).toHaveBeenCalledWith({ defaultPath: "pic.png" });
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [path, bytes] = writeFile.mock.calls[0];
    expect(path).toBe("/downloads/pic.png");
    expect(new TextDecoder().decode(bytes)).toBe("png-bytes");
    expect(clickSpy).not.toHaveBeenCalled();

    vi.doUnmock("@tauri-apps/plugin-dialog");
    vi.doUnmock("@tauri-apps/plugin-fs");
  });

  it("treats a cancelled save dialog as handled (no anchor fallback)", async () => {
    (window as any).__TAURI_INTERNALS__ = {};

    const save = vi.fn().mockResolvedValue(null);
    const writeFile = vi.fn();
    vi.doMock("@tauri-apps/plugin-dialog", () => ({ save }));
    vi.doMock("@tauri-apps/plugin-fs", () => ({ writeFile }));

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    vi.resetModules();
    const { downloadBlob: dl } = await import("@/platform/files");
    await dl(new Blob(["x"]), "pic.png");

    expect(save).toHaveBeenCalledTimes(1);
    expect(writeFile).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();

    vi.doUnmock("@tauri-apps/plugin-dialog");
    vi.doUnmock("@tauri-apps/plugin-fs");
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
