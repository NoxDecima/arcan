import { describe, it, expect } from "vitest";
// @ts-ignore — plain .mjs module, no type declarations
import { accentTokens, render, inject } from "../../scripts/gen-tokens.mjs";

// Expected values hand-derived from design/hf-kit.jsx skin() math.
describe("accentTokens", () => {
  it("darkens light-theme accent text 26% (tokyo)", () => {
    expect(accentTokens("tokyo", "light")["--color-accent"]).toBe("#5a78b7");
  });

  it("keeps dark-theme accent raw (tokyo)", () => {
    expect(accentTokens("tokyo", "dark")["--color-accent"]).toBe("#7aa2f7");
  });

  it("darkens light-theme fill 6% (tokyo)", () => {
    expect(accentTokens("tokyo", "light")["--color-accent-fill"]).toBe("#7398e8");
  });

  it("computes on-accent via luminance: dark tokyo gets void text", () => {
    expect(accentTokens("tokyo", "dark")["--color-on-accent"]).toBe("#0b0d14");
  });

  it("computes on-accent via luminance: light rose keeps white text", () => {
    expect(accentTokens("rose", "light")["--color-on-accent"]).toBe("#ffffff");
  });

  it("derives per-accent soft wash (teal dark)", () => {
    expect(accentTokens("teal", "dark")["--color-accent-soft"]).toBe(
      "rgba(115,218,202,0.16)",
    );
  });

  it("derives own-bubble tint from fill (tokyo dark, v5 ownTint .30)", () => {
    expect(accentTokens("tokyo", "dark")["--color-bubble-own"]).toBe(
      "rgba(122,162,247,0.3)",
    );
  });

  it("shades light gradient stops 5% (tokyo)", () => {
    expect(accentTokens("tokyo", "light")["--color-accent-grad-0"]).toBe("#749aeb");
    expect(accentTokens("tokyo", "light")["--color-accent-grad-1"]).toBe("#b292eb");
  });

  it("derives fab glow from fill (tokyo dark, alpha .45)", () => {
    expect(accentTokens("tokyo", "dark")["--color-accent-glow"]).toBe(
      "rgba(122,162,247,0.45)",
    );
  });

  it("derives cosmic-dot glow from fill (tokyo light, alpha .6 of shaded fill)", () => {
    expect(accentTokens("tokyo", "light")["--color-accent-dot"]).toBe(
      "rgba(115,152,232,0.6)",
    );
  });

  it("derives fab glow from fill (tokyo light, alpha .45 of 6%-shaded fill)", () => {
    expect(accentTokens("tokyo", "light")["--color-accent-glow"]).toBe(
      "rgba(115,152,232,0.45)",
    );
  });

  it("derives cosmic-dot from fill (tokyo dark, alpha .6)", () => {
    expect(accentTokens("tokyo", "dark")["--color-accent-dot"]).toBe(
      "rgba(122,162,247,0.6)",
    );
  });

  it("derives toast wash from text-safe accent (tokyo: dark .2, light .14)", () => {
    expect(accentTokens("tokyo", "dark")["--color-accent-wash"]).toBe(
      "rgba(122,162,247,0.2)",
    );
    // naive alpha(fill,.14) would be rgba(115,152,232,0.14) — the shade(-.26) here is the point
    expect(accentTokens("tokyo", "light")["--color-accent-wash"]).toBe(
      "rgba(90,120,183,0.14)",
    );
  });
});

describe("render + inject", () => {
  const css = "before\n/* @generated accents:start */\nOLD\n/* @generated accents:end */\nafter";

  it("replaces only the marked block", () => {
    const out = inject(css, "NEW");
    expect(out).toContain("before");
    expect(out).toContain("after");
    expect(out).toContain("NEW");
    expect(out).not.toContain("OLD");
  });

  it("is idempotent", () => {
    const once = inject(css, render());
    const twice = inject(once, render());
    expect(twice).toBe(once);
  });

  it("throws when markers are missing", () => {
    expect(() => inject("no markers here", "X")).toThrow(/marker/);
  });

  it("throws when markers are in wrong order", () => {
    const swapped =
      "/* @generated accents:end */\nOLD\n/* @generated accents:start */";
    expect(() => inject(swapped, "X")).toThrow(/order/);
  });

  it("emits all 6 accents × both themes plus fallbacks", () => {
    const out = render();
    for (const k of ["tokyo", "violet", "teal", "lime", "amber", "rose"]) {
      expect(out).toContain(`:root[data-accent="${k}"]`);
      expect(out).toContain(`:root[data-theme="light"][data-accent="${k}"]`);
    }
    // no-attribute fallbacks (tokyo)
    expect(out).toMatch(/:root \{/);
    expect(out).toMatch(/:root\[data-theme="light"\] \{/);
  });
});
