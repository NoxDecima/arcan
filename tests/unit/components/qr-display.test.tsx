import { describe, test, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QRDisplay } from "@/components/qr-display";

// QRDisplay reads the resolved theme via useTheme to re-render on theme flip;
// stub it so the component can render outside a ThemeProvider.
vi.mock("@/styles/use-theme", () => ({ useTheme: () => ({ theme: "dark" }) }));

describe("QRDisplay theme-aware colors", () => {
  test("modules + background use token colors, not qrcode.react defaults", () => {
    const { container } = render(<QRDisplay url="https://x" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();

    // qrcode.react@4.2.0 QRCodeSVG renders two <path> children:
    //   [0] background  -> fill={bgColor} (default would be #FFFFFF)
    //   [1] modules     -> fill={fgColor} (default would be #000000)
    // The <svg> element itself carries no `fill` attribute.
    const paths = svg!.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(2);

    const bgFill = paths[0].getAttribute("fill");
    const fgFill = paths[paths.length - 1].getAttribute("fill");

    // Not the library defaults — proves theme-aware colors were applied.
    expect(fgFill).not.toBe("#000000");
    expect(bgFill).not.toBe("#FFFFFF");

    // jsdom has no real CSS loaded, so the component falls back to its
    // dark-theme token hexes (text on panel).
    expect(fgFill).toBe("#c8d1f0");
    expect(bgFill).toBe("#12141f");
  });
});
