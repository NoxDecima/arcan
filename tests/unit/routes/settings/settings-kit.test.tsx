import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Icon,
  Chev,
  Toggle,
  Card,
  SectionLabel,
  SRow,
} from "@/routes/settings/settings-kit";

describe("settings-kit Icon", () => {
  test("renders an svg with the named path and size", () => {
    const { container } = render(<Icon d="key" size={17} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("width")).toBe("17");
    expect(svg.getAttribute("height")).toBe("17");
    // currentColor so a text-* class drives the colour (token-compliant)
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    const path = svg.querySelector("path")!;
    expect(path.getAttribute("d")).toContain("M19 11H5"); // key glyph
  });

  test("passes className through to the svg", () => {
    const { container } = render(<Icon d="shield" className="text-red" />);
    expect(container.querySelector("svg")!.getAttribute("class")).toContain(
      "text-red",
    );
  });
});

describe("settings-kit Chev", () => {
  test("renders a dim 15px chevron", () => {
    const { container } = render(<Chev />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("15");
    expect(svg.getAttribute("class")).toContain("text-dim");
  });
});

describe("settings-kit Toggle", () => {
  test("on=true exposes aria-checked and switch role", () => {
    render(<Toggle on={true} aria-label="t" />);
    const sw = screen.getByRole("switch", { name: "t" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  test("on=false renders aria-checked=false", () => {
    render(<Toggle on={false} aria-label="t" />);
    expect(
      screen.getByRole("switch", { name: "t" }).getAttribute("aria-checked"),
    ).toBe("false");
  });
});

describe("settings-kit Card", () => {
  test("renders panel bg + hairline border + 14px radius", () => {
    const { container } = render(<Card>x</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("bg-panel");
    expect(div.className).toContain("border-hairline");
    expect(div.className).toContain("rounded-r-5");
  });
});

describe("settings-kit SectionLabel", () => {
  test("renders an uppercase tracked label", () => {
    render(<SectionLabel>account</SectionLabel>);
    const el = screen.getByText("account");
    expect(el.className).toContain("uppercase");
    expect(el.className).toContain("text-dim");
  });
});

describe("settings-kit SRow", () => {
  test("renders leading icon, label, sub, value", () => {
    const { container } = render(
      <SRow icon="key" label="change password" sub="hi" value="now" />,
    );
    expect(screen.getByText("change password")).toBeTruthy();
    expect(screen.getByText("hi")).toBeTruthy();
    expect(screen.getByText("now")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy(); // leading icon
  });

  test("danger renders label + icon in red", () => {
    const { container } = render(
      <SRow icon="logout" label="sign out" danger last />,
    );
    const label = screen.getByText("sign out");
    expect(label.className).toContain("text-red");
    // leading icon wrapper carries the red text colour
    const iconWrap = container.querySelector("[data-icon-wrap]")!;
    expect(iconWrap.className).toContain("text-red");
  });

  test("last=true omits the bottom divider", () => {
    const { container } = render(<SRow label="x" last />);
    expect((container.firstChild as HTMLElement).className).not.toContain(
      "border-b",
    );
  });

  test("non-last renders the bottom divider", () => {
    const { container } = render(<SRow label="x" />);
    expect((container.firstChild as HTMLElement).className).toContain(
      "border-b",
    );
  });

  test("clickable row renders as a button when onClick is given", () => {
    render(<SRow label="go" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: /go/ })).toBeTruthy();
  });
});
