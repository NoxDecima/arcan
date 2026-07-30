import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downscaleToFit } from "@/jazz/image-downscale";

function fileOfSize(bytes: number, type = "image/jpeg", name = "photo.jpg"): File {
  const f = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

let toBlobSizes: number[] = [];
// Capture what the code actually asks the canvas to do, so the tests guard the
// dimension math and the encode args — not just the final byte size.
let drawImageArgs: Array<{ w: number; h: number }> = [];
let toBlobArgs: Array<{ type?: string; quality?: number }> = [];

beforeEach(() => {
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap =
    vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() }));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: (_img: unknown, _x: number, _y: number, w: number, h: number) => {
      drawImageArgs.push({ w, h });
    },
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function (
    cb: (b: Blob | null) => void,
    type?: string,
    quality?: number,
  ) {
    toBlobArgs.push({ type, quality });
    const size = toBlobSizes.shift() ?? 100;
    const blob = new Blob([new Uint8Array(0)]);
    Object.defineProperty(blob, "size", { value: size });
    cb(blob);
  } as unknown as typeof HTMLCanvasElement.prototype.toBlob;
});

afterEach(() => {
  vi.restoreAllMocks();
  toBlobSizes = [];
  drawImageArgs = [];
  toBlobArgs = [];
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
    // always re-encodes as JPEG; drops quality before touching dimensions
    expect(toBlobArgs.every((a) => a.type === "image/jpeg")).toBe(true);
    expect(toBlobArgs[1].quality).toBeLessThan(toBlobArgs[0].quality!);
    expect(drawImageArgs.every((a) => a.w === 4000)).toBe(true); // full res still
  });

  it("scales down dimensions once quality reduction is exhausted", async () => {
    // over-cap through the 3 quality steps (0.9→0.75→0.60→0.45), then the
    // loop switches to scaling; the 5th encode (scale 0.8) lands under cap.
    toBlobSizes = [8000, 8000, 8000, 8000, 3000];
    const f = fileOfSize(20000, "image/jpeg", "huge.jpg");
    const out = await downscaleToFit(f, 5000);
    expect(out).not.toBe(f);
    expect(out.type).toBe("image/jpeg");
    // the final draw used reduced dimensions (4000 * 0.8 = 3200), proving the
    // scale branch ran — not just repeated full-res quality drops.
    const last = drawImageArgs[drawImageArgs.length - 1];
    expect(last.w).toBe(3200);
    expect(last.h).toBe(2400);
    expect(last.w).toBeLessThan(4000);
  });

  it("returns the original if it can't get under the cap", async () => {
    toBlobSizes = Array(20).fill(99999); // always too big
    const f = fileOfSize(9000, "image/jpeg");
    const out = await downscaleToFit(f, 5000);
    expect(out).toBe(f);
  });
});
