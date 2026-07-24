import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerAttachmentTray } from "@/components/composer-attachment-tray";

beforeEach(() => {
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:mock");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

describe("ComposerAttachmentTray", () => {
  it("renders exactly one item immediately after the first image is added", () => {
    const file = new File([new Uint8Array([1])], "p.jpg", { type: "image/jpeg" });
    render(
      <ComposerAttachmentTray
        pending={[{ tempId: "t1", file }]}
        onRemove={() => {}}
      />,
    );
    expect(screen.getAllByTestId("composer-attachment-tray-item")).toHaveLength(1);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  // Root-phenomenon reproduction: a server (static) render runs NO effects.
  // If the <img> is absent in static markup, the image's presence depends on a
  // post-mount effect + a later render — the exact fragility that causes the
  // "first attachment doesn't appear until a second is added" race.
  it("includes the <img> on the FIRST commit (no dependence on a post-mount effect)", () => {
    const file = new File([new Uint8Array([1])], "p.jpg", { type: "image/jpeg" });
    const html = renderToStaticMarkup(
      <ComposerAttachmentTray
        pending={[{ tempId: "t1", file }]}
        onRemove={() => {}}
      />,
    );
    expect(html).toContain("<img");
  });
});
