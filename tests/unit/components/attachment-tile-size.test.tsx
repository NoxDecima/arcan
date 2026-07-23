import { describe, test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AttachmentTile } from "@/components/attachment-tile";

vi.mock("jazz-tools", () => ({
  co: {
    fileStream: () => ({
      loadAsBlob: async () => new Blob(["x"], { type: "image/png" }),
    }),
  },
}));

vi.mock("@/platform/files", () => ({
  downloadBlob: vi.fn(async () => {}),
}));

describe("sent image tile sizing (feedback round 4)", () => {
  test("image can never exceed its container: min(280px, 100%)", async () => {
    vi.stubGlobal("URL", Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    }));
    render(
      <AttachmentTile
        attachment={{
          mimeType: "image/png",
          filename: "photo.png",
          size: 1234,
          data: { $jazz: { id: "co_zstream" } },
        }}
        mode="sent"
        loadAs={{}}
        onImageClick={() => {}}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("attachment-tile-sent-image").querySelector("img"),
      ).toBeTruthy();
    });
    const img = screen
      .getByTestId("attachment-tile-sent-image")
      .querySelector("img")!;
    expect(img.style.maxWidth).toBe("min(280px, 100%)");
    expect(img.style.maxHeight).toBe("280px");
  });
});
