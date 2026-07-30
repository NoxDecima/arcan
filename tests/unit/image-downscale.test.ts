import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downscaleToFit } from "@/jazz/image-downscale";

function fileOfSize(bytes: number, type = "image/jpeg", name = "photo.jpg"): File {
  const f = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

let toBlobSizes: number[] = [];

beforeEach(() => {
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap =
    vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() }));
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({ drawImage: vi.fn() }),
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function (
    cb: (b: Blob | null) => void,
  ) {
    const size = toBlobSizes.shift() ?? 100;
    const blob = new Blob([new Uint8Array(0)]);
    Object.defineProperty(blob, "size", { value: size });
    cb(blob);
  } as unknown as typeof HTMLCanvasElement.prototype.toBlob;
});

afterEach(() => {
  vi.restoreAllMocks();
  toBlobSizes = [];
  // @ts-expect-error test cleanup
  delete (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap;
});

describe("downscaleToFit", () => {
  it("returns the file unchanged when already under the cap (no decode)", async () => {
    const f = fileOfSize(1000, "image/jpeg");
    const out = await downscaleToFit(f, 5000);
    expect(out).toBe(f);
    expect(
      (globalThis as unknown as { createImageBitmap: ReturnType<typeof vi.fn> })
        .createImageBitmap,
    ).not.toHaveBeenCalled();
  });

  it("returns non-image files unchanged", async () => {
    const f = fileOfSize(9999, "application/pdf", "doc.pdf");
    const out = await downscaleToFit(f, 5000);
    expect(out).toBe(f);
  });

  it("shrinks an over-cap image below the cap and returns a jpeg", async () => {
    toBlobSizes = [8000, 3000]; // first encode too big, second under cap
    const f = fileOfSize(9000, "image/jpeg", "big.png");
    const out = await downscaleToFit(f, 5000);
    expect(out).not.toBe(f);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toMatch(/\.jpg$/);
  });

  it("returns the original if it can't get under the cap", async () => {
    toBlobSizes = Array(20).fill(99999); // always too big
    const f = fileOfSize(9000, "image/jpeg");
    const out = await downscaleToFit(f, 5000);
    expect(out).toBe(f);
  });
});
