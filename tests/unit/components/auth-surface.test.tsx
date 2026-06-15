import { describe, test, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AuthSurface, Wordmark, Steps } from "@/components/auth-surface";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("<AuthSurface />", () => {
  test("renders a full-bleed cosmic backdrop with the Lattice watermark", () => {
    const { container } = render(
      <AuthSurface>
        <span data-testid="child">hi</span>
      </AuthSurface>,
    );
    // Outer surface is full-bleed dark.
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.className).toMatch(/min-h-screen/);
    expect(root.className).toMatch(/bg-bg/);
    // Lattice watermark is rendered as an SVG with role="img".
    const lattices = container.querySelectorAll("svg[role='img']");
    expect(lattices.length).toBeGreaterThanOrEqual(1);
    // Children render in the centered card column.
    expect(container.querySelector("[data-testid='child']")).not.toBeNull();
  });

  test("renders exactly four scattered cosmic stars", () => {
    const { container } = render(<AuthSurface>x</AuthSurface>);
    const stars = container.querySelectorAll("[data-auth-star]");
    expect(stars.length).toBe(4);
  });

  test("default card column width is 320px", () => {
    const { container } = render(<AuthSurface>x</AuthSurface>);
    const col = container.querySelector("[data-auth-column]") as HTMLElement;
    expect(col).not.toBeNull();
    expect(col.style.width).toBe("320px");
  });

  test("respects the `w` prop for card column width", () => {
    const { container } = render(<AuthSurface w={368}>x</AuthSurface>);
    const col = container.querySelector("[data-auth-column]") as HTMLElement;
    expect(col.style.width).toBe("368px");
  });

  test("tall variant pins the column to the top and allows scroll", () => {
    const { container } = render(<AuthSurface tall>x</AuthSurface>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/items-start/);
    expect(root.className).toMatch(/overflow-auto/);
  });

  test("force-dark sets html[data-theme='dark'] while mounted and restores on unmount", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const { unmount } = render(<AuthSurface forceDark>x</AuthSurface>);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    unmount();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("<Wordmark />", () => {
  test("renders a centered Arcan Lattice + 'arcan' wordmark", () => {
    const { container, getByText } = render(<Wordmark size={26} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/justify-center/);
    expect(getByText("arcan")).not.toBeNull();
    // Lattice SVG present
    expect(container.querySelector("svg[role='img']")).not.toBeNull();
  });
});

describe("<Steps />", () => {
  test("renders four dashes by default with the first `n` filled with arcan-accent", () => {
    const { container } = render(<Steps n={2} />);
    const dashes = container.querySelectorAll("[data-auth-step]");
    expect(dashes.length).toBe(4);
    // First two filled, last two unfilled.
    expect((dashes[0] as HTMLElement).className).toMatch(/bg-arcan-accent/);
    expect((dashes[1] as HTMLElement).className).toMatch(/bg-arcan-accent/);
    expect((dashes[2] as HTMLElement).className).toMatch(/bg-panel-2/);
    expect((dashes[3] as HTMLElement).className).toMatch(/bg-panel-2/);
  });

  test("supports a custom `of` count", () => {
    const { container } = render(<Steps n={1} of={5} />);
    expect(container.querySelectorAll("[data-auth-step]").length).toBe(5);
  });
});
