import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { Lattice, latticeTier } from "@/components/lattice";

describe("latticeTier", () => {
  test("size >= 44 returns 'full'", () => {
    expect(latticeTier(44)).toBe("full");
    expect(latticeTier(64)).toBe("full");
  });
  test("26 <= size < 44 returns 'reduced'", () => {
    expect(latticeTier(26)).toBe("reduced");
    expect(latticeTier(43)).toBe("reduced");
  });
  test("18 <= size < 26 returns 'minimal'", () => {
    expect(latticeTier(18)).toBe("minimal");
    expect(latticeTier(25)).toBe("minimal");
  });
  test("size < 18 returns 'glyph'", () => {
    expect(latticeTier(17)).toBe("glyph");
    expect(latticeTier(12)).toBe("glyph");
  });
});

describe("<Lattice />", () => {
  test("renders an SVG with the right viewBox and labelled accessible name", () => {
    const { container } = render(<Lattice size={48} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Arcan");
  });

  test("mono prop uses currentColor for the stroke fill", () => {
    const { container } = render(<Lattice size={48} mono />);
    const svg = container.querySelector("svg");
    expect(svg?.innerHTML).toContain("currentColor");
  });

  test("non-mono uses an accent linear gradient", () => {
    const { container } = render(<Lattice size={48} />);
    const svg = container.querySelector("svg");
    expect(svg?.innerHTML).toContain("<linearGradient");
    expect(svg?.innerHTML).toContain("--color-accent-grad-0");
  });
});
