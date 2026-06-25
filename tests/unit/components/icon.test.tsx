import { render } from "@testing-library/react";
import { Icon } from "@/components/icon";

describe("Icon", () => {
  it("renders an svg with the requested data-icon and size", () => {
    const { container } = render(<Icon name="gear" size={20} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("data-icon")).toBe("gear");
    expect(svg!.getAttribute("width")).toBe("20");
    expect(svg!.getAttribute("height")).toBe("20");
  });

  it("uses currentColor for the stroke so color is inherited", () => {
    const { container } = render(<Icon name="plus" />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("stroke")).toBe("currentColor");
  });

  it("supports all four IA glyphs", () => {
    for (const name of ["chat", "people", "gear", "plus"] as const) {
      const { container } = render(<Icon name={name} />);
      expect(container.querySelector(`svg[data-icon="${name}"]`)).not.toBeNull();
    }
  });
});
