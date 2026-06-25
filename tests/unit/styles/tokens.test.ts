// tests/unit/styles/tokens.test.ts
import { describe, test, expect } from "vitest";

/**
 * Smoke check: tokens.css must load and expose its core CSS variables.
 * We can't render real CSS in jsdom but we can import the file and parse
 * the `:root` block by string search.
 */
import tokensCss from "@/styles/tokens.css?raw";

describe("tokens.css", () => {
  test("declares --color-bg, --color-text, --font-body, --font-mono in :root", () => {
    expect(tokensCss).toContain("--color-bg");
    expect(tokensCss).toContain("--color-text");
    expect(tokensCss).toContain("--font-body");
    expect(tokensCss).toContain("--font-mono");
  });

  test("declares all six accent palettes", () => {
    for (const accent of ["tokyo", "violet", "teal", "lime", "amber", "rose"]) {
      expect(tokensCss).toContain(`data-accent="${accent}"`);
    }
  });

  test("declares the light theme overrides", () => {
    expect(tokensCss).toContain('data-theme="light"');
  });

  test("v5 soft-skin radius tokens are present", () => {
    expect(tokensCss).toContain("--r-4: 12px");
    expect(tokensCss).toContain("--r-5: 14px");
    expect(tokensCss).toContain("--r-avatar: 10px");
    expect(tokensCss).toContain("--r-avatar-lg: 18px");
  });

  test("declares the three gradient tokens used by Phase B sub-units", () => {
    // --gradient-primary: accent blue→violet sweep, used by wordmark gradient + primary CTAs
    expect(tokensCss).toContain("--gradient-primary:");
    expect(tokensCss).toMatch(/--gradient-primary:\s*linear-gradient\(/);
    // --gradient-rule: blue→violet→transparent, used by section divider rules
    expect(tokensCss).toContain("--gradient-rule:");
    expect(tokensCss).toMatch(/--gradient-rule:\s*linear-gradient\(/);
    // --gradient-cosmic: radial backdrop for AuthSurface
    expect(tokensCss).toContain("--gradient-cosmic:");
    expect(tokensCss).toMatch(/--gradient-cosmic:\s*radial-gradient\(/);
  });
});
