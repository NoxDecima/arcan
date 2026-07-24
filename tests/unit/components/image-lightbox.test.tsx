import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ImageLightbox } from "@/components/image-lightbox";
import { ToastProvider } from "@/components/toast";

/**
 * #58: the lightbox download button must route through the platform
 * capability (downloadBlob) instead of an `<a download>` on the blob: URL —
 * anchor downloads silently do nothing in the Tauri Android WebView.
 * The platform module is mocked; this pins the component-side dispatch:
 * displayed object URL → fetched Blob → downloadBlob(blob, filename).
 */

vi.mock("@/platform/files", () => ({
  downloadBlob: vi.fn(async () => {}),
}));

// image-lightbox imports useAttachmentImageUrl from attachment-tile, which
// pulls in jazz-tools at module scope. Single-src mode never calls into it
// (no streamID), so a minimal stub keeps the test light.
vi.mock("jazz-tools", () => ({
  co: { fileStream: () => ({ loadAsBlob: async () => null }) },
}));

import { downloadBlob } from "@/platform/files";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ImageLightbox download (#58)", () => {
  test("download button fetches the shown blob URL and hands it to downloadBlob", async () => {
    const fetchedBlob = new Blob(["img"], { type: "image/png" });
    const fetchMock = vi.fn(async () => ({ blob: async () => fetchedBlob }));
    vi.stubGlobal("fetch", fetchMock);

    const onClose = vi.fn();
    render(
      <ToastProvider>
        <ImageLightbox src="blob:shown-url" filename="pic.png" onClose={onClose} />
      </ToastProvider>,
    );

    screen.getByTestId("image-lightbox-download").click();

    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).toHaveBeenCalledWith("blob:shown-url");
    expect(vi.mocked(downloadBlob).mock.calls[0][0]).toBe(fetchedBlob);
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe("pic.png");
    // stopPropagation: the click must not fall through to the backdrop.
    expect(onClose).not.toHaveBeenCalled();
  });

  test("missing filename falls back to 'image'", async () => {
    const fetchMock = vi.fn(async () => ({ blob: async () => new Blob(["x"]) }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ToastProvider>
        <ImageLightbox src="blob:shown-url" onClose={() => {}} />
      </ToastProvider>,
    );
    screen.getByTestId("image-lightbox-download").click();

    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe("image");
  });
});
