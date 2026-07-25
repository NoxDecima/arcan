import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComposerAttachmentSheet } from "@/components/composer-attachment-sheet";

describe("ComposerAttachmentSheet", () => {
  it("renders Photos and File rows when open", () => {
    render(<ComposerAttachmentSheet open onClose={() => {}} onPick={() => {}} />);
    expect(screen.getByTestId("attach-source-photos")).toBeInTheDocument();
    expect(screen.getByTestId("attach-source-file")).toBeInTheDocument();
  });
  it("calls onPick('photos') when Photos is tapped", () => {
    const onPick = vi.fn();
    render(<ComposerAttachmentSheet open onClose={() => {}} onPick={onPick} />);
    fireEvent.click(screen.getByTestId("attach-source-photos"));
    expect(onPick).toHaveBeenCalledWith("photos");
  });
  it("calls onPick('file') when File is tapped", () => {
    const onPick = vi.fn();
    render(<ComposerAttachmentSheet open onClose={() => {}} onPick={onPick} />);
    fireEvent.click(screen.getByTestId("attach-source-file"));
    expect(onPick).toHaveBeenCalledWith("file");
  });
  it("renders nothing when closed", () => {
    render(<ComposerAttachmentSheet open={false} onClose={() => {}} onPick={() => {}} />);
    expect(screen.queryByTestId("attach-source-photos")).toBeNull();
  });
});
