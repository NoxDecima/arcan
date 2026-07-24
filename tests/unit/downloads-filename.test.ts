import { describe, it, expect } from "vitest";
import { downloadCollisionSafeName } from "@/platform/files";

describe("downloadCollisionSafeName", () => {
  it("inserts a numeric suffix before the extension", () => {
    const n = downloadCollisionSafeName("photo.jpg", 1737000000000);
    expect(n).toMatch(/^photo-1737000000000\.jpg$/);
  });
  it("handles names with no extension", () => {
    const n = downloadCollisionSafeName("photo", 42);
    expect(n).toBe("photo-42");
  });
  it("handles names with multiple dots (only the last is the ext)", () => {
    const n = downloadCollisionSafeName("my.file.png", 7);
    expect(n).toBe("my.file-7.png");
  });
});
