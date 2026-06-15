import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyPane } from "@/components/empty-pane";

describe("<EmptyPane variant='reading-pane'>", () => {
  test("renders the title and description", () => {
    render(
      <EmptyPane
        variant="reading-pane"
        title="select a conversation"
        description="or start a new one — end-to-end encrypted"
      />,
    );
    expect(screen.getByText("select a conversation")).toBeInTheDocument();
    expect(
      screen.getByText("or start a new one — end-to-end encrypted"),
    ).toBeInTheDocument();
  });

  test("renders two Lattice SVGs: the oversized watermark + the centered mark", () => {
    const { container } = render(
      <EmptyPane
        variant="reading-pane"
        title="select a conversation"
        description="…"
      />,
    );
    const svgs = container.querySelectorAll("svg[aria-label='Arcan']");
    expect(svgs.length).toBe(2);
  });

  test("the oversized watermark is hidden from the a11y tree", () => {
    const { container } = render(
      <EmptyPane
        variant="reading-pane"
        title="select a conversation"
        description="…"
      />,
    );
    // The wrapper that holds the oversized Lattice carries aria-hidden so
    // screen readers don't double-announce the brand mark.
    const watermark = container.querySelector("[data-empty-pane-watermark]");
    expect(watermark).not.toBeNull();
    expect(watermark?.getAttribute("aria-hidden")).toBe("true");
  });

  test("title renders as a heading for landmark navigation", () => {
    render(
      <EmptyPane
        variant="reading-pane"
        title="select a conversation"
        description="…"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "select a conversation" }),
    ).toBeInTheDocument();
  });

  test("renders an optional data-testid passthrough", () => {
    const { container } = render(
      <EmptyPane
        variant="reading-pane"
        title="t"
        description="d"
        data-testid="my-empty"
      />,
    );
    expect(container.querySelector('[data-testid="my-empty"]')).not.toBeNull();
  });
});

describe("<EmptyPane variant='compact'>", () => {
  test("renders the title and description", () => {
    render(
      <EmptyPane
        variant="compact"
        title="no contacts yet"
        description="invite someone via a QR code or share link."
      />,
    );
    expect(screen.getByText("no contacts yet")).toBeInTheDocument();
    expect(
      screen.getByText("invite someone via a QR code or share link."),
    ).toBeInTheDocument();
  });

  test("renders exactly one Lattice mark (no oversized watermark)", () => {
    const { container } = render(
      <EmptyPane variant="compact" title="t" description="d" />,
    );
    const svgs = container.querySelectorAll("svg[aria-label='Arcan']");
    expect(svgs.length).toBe(1);
  });

  test("renders an optional CTA via the cta prop", () => {
    render(
      <EmptyPane
        variant="compact"
        title="no contacts yet"
        description="…"
        cta={<button data-testid="my-cta">add a contact</button>}
      />,
    );
    expect(screen.getByTestId("my-cta")).toBeInTheDocument();
  });

  test("omits the CTA wrapper when no cta prop is given", () => {
    const { container } = render(
      <EmptyPane variant="compact" title="t" description="d" />,
    );
    expect(
      container.querySelector("[data-empty-pane-cta]"),
    ).toBeNull();
  });
});
