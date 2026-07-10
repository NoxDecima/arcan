import { describe, it, expect, afterEach } from "vitest";
import { pickFilesNative, saveBlobNative } from "@/platform/files";

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
});

describe("files adapter on web", () => {
  it("pickFilesNative returns null (caller falls back to <input type=file>)", async () => {
    expect(await pickFilesNative({ multiple: true })).toBeNull();
  });

  it("saveBlobNative returns false (caller falls back to anchor download)", async () => {
    expect(await saveBlobNative(new Blob(["x"]), "x.txt")).toBe(false);
  });
});
