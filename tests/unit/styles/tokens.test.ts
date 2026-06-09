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
});
