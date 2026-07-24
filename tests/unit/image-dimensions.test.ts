import { describe, it, expect, vi, afterEach } from "vitest";
import { readImageDimensions } from "@/jazz/image-dimensions";

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error test cleanup
  delete (globalThis as any).createImageBitmap;
});

describe("readImageDimensions", () => {
  it("returns null for non-image files without touching the decoder", async () => {
    const spy = vi.fn();
    (globalThis as any).createImageBitmap = spy;
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    expect(await readImageDimensions(file)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns width/height from createImageBitmap for an image file", async () => {
    (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue({
      width: 800,
      height: 1200,
      close: vi.fn(),
    });
    const file = new File([new Uint8Array([1, 2, 3])], "p.jpg", {
      type: "image/jpeg",
    });
    expect(await readImageDimensions(file)).toEqual({ width: 800, height: 1200 });
  });

  it("returns null (never throws) when decoding fails", async () => {
    (globalThis as any).createImageBitmap = vi
      .fn()
      .mockRejectedValue(new Error("bad image"));
    const file = new File([new Uint8Array([1])], "p.jpg", { type: "image/jpeg" });
    expect(await readImageDimensions(file)).toBeNull();
  });
});
