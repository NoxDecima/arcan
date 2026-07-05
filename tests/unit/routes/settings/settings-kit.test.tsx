/**
 * settings-kit.test.tsx
 *
 * Tests the live @/ui/kit primitives that supersede the retired settings-kit
 * exports (Phase 4 of Wave C deletes src/routes/settings/settings-kit.tsx).
 *
 * Coverage: Icon, PCard, PSectionLabel, PToggle, PRow — render behavior and
 * token-compliance assertions mirrored from the original settings-kit tests.
 */
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Icon, PCard, PSectionLabel, PToggle, PRow } from "@/ui/kit";

// ── Icon ─────────────────────────────────────────────────────────────────────

describe("kit Icon", () => {
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

// ── PCard ────────────────────────────────────────────────────────────────────

describe("kit PCard", () => {
  test("renders panel bg + hairline border + 14px radius", () => {
    const { container } = render(<PCard>x</PCard>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("bg-panel");
    expect(div.className).toContain("border-hairline");
    expect(div.className).toContain("rounded-r-5");
  });
});

// ── PSectionLabel ─────────────────────────────────────────────────────────────

describe("kit PSectionLabel", () => {
  test("renders an uppercase tracked label", () => {
    const { container } = render(<PSectionLabel>account</PSectionLabel>);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("uppercase");
    expect(span.className).toContain("text-dim");
  });
});

// ── PToggle ──────────────────────────────────────────────────────────────────

describe("kit PToggle", () => {
  test("on=true exposes aria-checked and switch role", () => {
    render(<PToggle on={true} aria-label="t" />);
    const sw = screen.getByRole("switch", { name: "t" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  test("on=false renders aria-checked=false", () => {
    render(<PToggle on={false} aria-label="t" />);
    expect(
      screen.getByRole("switch", { name: "t" }).getAttribute("aria-checked"),
    ).toBe("false");
  });
});

// ── PRow ─────────────────────────────────────────────────────────────────────

describe("kit PRow", () => {
  test("renders leading icon, label, sub, value", () => {
    const { container } = render(
      <PRow icon="key" label="change password" sub="hi" value="now" />,
    );
    expect(screen.getByText("change password")).toBeTruthy();
    expect(screen.getByText("hi")).toBeTruthy();
    expect(screen.getByText("now")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy(); // leading icon
  });

  test("danger renders label + icon in red", () => {
    const { container } = render(
      <PRow icon="logout" label="sign out" danger last />,
    );
    const label = screen.getByText("sign out");
    expect(label.className).toContain("text-red");
    // Leading icon svg carries the red text colour via className
    const iconSvg = container.querySelector("svg")!;
    expect(iconSvg.getAttribute("class")).toContain("text-red");
  });

  test("last=true omits the bottom divider", () => {
    const { container } = render(<PRow label="x" last />);
    expect((container.firstChild as HTMLElement).className).not.toContain(
      "border-b",
    );
  });

  test("non-last renders the bottom divider", () => {
    const { container } = render(<PRow label="x" />);
    expect((container.firstChild as HTMLElement).className).toContain(
      "border-b",
    );
  });

  test("renders as a button-role element (div with role=button)", () => {
    render(<PRow label="go" onClick={() => {}} />);
    // PRow changed from <button> to <div role="button"> (item 10, nested-button fix).
    // getByRole("button") finds explicit role="button" on a div as well as <button>.
    expect(screen.getByRole("button", { name: /go/ })).toBeTruthy();
  });

  test("renders trailing chevron when clickable and no right/value slot", () => {
    const { container } = render(<PRow label="link" onClick={vi.fn()} />);
    const svgs = container.querySelectorAll("svg");
    // Trailing chev is 15px wide; leading icon (if any) is 17px.
    // With no icon prop, the only svg is the trailing chev.
    const chevSvg = svgs[svgs.length - 1];
    expect(chevSvg.getAttribute("width")).toBe("15");
    expect(chevSvg.getAttribute("class")).toContain("text-dim");
  });
});
