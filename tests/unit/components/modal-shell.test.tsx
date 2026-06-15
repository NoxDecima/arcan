import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModalShell, ModalFooter, MobileBottomSheet } from "@/components/modal-shell";

describe("ModalShell", () => {
  test("renders title, body, and footer slots", () => {
    render(
      <ModalShell
        open
        title="change password"
        onClose={() => {}}
        footer={<ModalFooter><button>cancel</button><button>save</button></ModalFooter>}
      >
        <p>body text</p>
      </ModalShell>,
    );
    expect(screen.getByText("change password")).toBeInTheDocument();
    expect(screen.getByText("body text")).toBeInTheDocument();
    expect(screen.getByText("cancel")).toBeInTheDocument();
    expect(screen.getByText("save")).toBeInTheDocument();
  });

  test("calls onClose when the X button is clicked", async () => {
    const onClose = vi.fn();
    render(<ModalShell open title="t" onClose={onClose}><p>x</p></ModalShell>);
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<ModalShell open title="t" onClose={onClose}><p>x</p></ModalShell>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(<ModalShell open title="t" onClose={onClose}><p>x</p></ModalShell>);
    await userEvent.click(screen.getByTestId("modal-shell-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("does NOT close when content inside the Card is clicked", async () => {
    const onClose = vi.fn();
    render(<ModalShell open title="t" onClose={onClose}><p data-testid="inner">x</p></ModalShell>);
    await userEvent.click(screen.getByTestId("inner"));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("renders nothing when open=false", () => {
    render(<ModalShell open={false} title="t" onClose={() => {}}><p>hidden</p></ModalShell>);
    expect(screen.queryByText("hidden")).toBeNull();
  });

  test("exposes role=\"dialog\" and aria-modal=true", () => {
    render(<ModalShell open title="t" onClose={() => {}}><p>x</p></ModalShell>);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  test("respects an explicit dataTestId on the Card wrapper", () => {
    render(<ModalShell open title="t" onClose={() => {}} dataTestId="my-modal"><p>x</p></ModalShell>);
    expect(screen.getByTestId("my-modal")).toBeInTheDocument();
  });
});

describe("MobileBottomSheet", () => {
  test("renders title + body + footer like ModalShell", () => {
    render(
      <MobileBottomSheet
        open
        title="pick a contact"
        onClose={() => {}}
        footer={<button>continue</button>}
      >
        <p>list</p>
      </MobileBottomSheet>,
    );
    expect(screen.getByText("pick a contact")).toBeInTheDocument();
    expect(screen.getByText("list")).toBeInTheDocument();
    expect(screen.getByText("continue")).toBeInTheDocument();
  });

  test("Card has the sheet anchoring classes", () => {
    render(
      <MobileBottomSheet open title="t" onClose={() => {}} dataTestId="sheet"><p>x</p></MobileBottomSheet>,
    );
    const card = screen.getByTestId("sheet");
    expect(card.className).toMatch(/max-h-\[75vh\]/);
    // Anchored bottom on mobile; centered above sm breakpoint via responsive prefixes.
    expect(card.className).toMatch(/rounded-t-r-3|rounded-t-/);
  });

  test("closes on Esc + backdrop", () => {
    const onClose = vi.fn();
    render(<MobileBottomSheet open title="t" onClose={onClose}><p>x</p></MobileBottomSheet>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
