// scripts/gen-tokens.mjs — regenerate the accent-derived token block in
// src/styles/tokens.css from the design prototype's skin() math.
//
// Source of truth: design/hf-kit.jsx (ACCENTS, shade/lum/alpha, skin(), v5
// ownTint). If the prototype's math changes, change it here identically and
// re-run:  node scripts/gen-tokens.mjs
//
// The script is idempotent: it rewrites only the block between the
// "@generated accents" markers in tokens.css.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ACCENTS = {
  tokyo: { solid: "#7aa2f7", grad: ["#7aa2f7", "#bb9af7"] },
  violet: { solid: "#bb9af7", grad: ["#bb9af7", "#7aa2f7"] },
  teal: { solid: "#73daca", grad: ["#73daca", "#7dcfff"] },
  lime: { solid: "#9ece6a", grad: ["#9ece6a", "#73daca"] },
  amber: { solid: "#e0af68", grad: ["#e0af68", "#f7768e"] },
  rose: { solid: "#f7768e", grad: ["#f7768e", "#bb9af7"] },
};
const ACCENT_KEYS = ["tokyo", "violet", "teal", "lime", "amber", "rose"];

// --- color math ported from design/hf-kit.jsx (hf-kit names: _hx, _to) ---
function hx(h) {
  h = h.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function to(r, g, b) {
  const f = (v) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + f(r) + f(g) + f(b);
}
export function shade(hex, amt) {
  const [r, g, b] = hx(hex);
  if (amt < 0) {
    const k = 1 + amt;
    return to(r * k, g * k, b * k);
  }
  return to(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}
export function lum(hex) {
  const v = hx(hex).map((x) => x / 255);
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
export function alpha(hex, a) {
  const [r, g, b] = hx(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// One accent × theme → token map. Mirrors hf-kit skin() + VARIANTS.v5.ownTint.
export function accentTokens(key, theme) {
  const a = ACCENTS[key];
  const fill = theme === "light" ? shade(a.solid, -0.06) : a.solid;
  const g0 = theme === "light" ? shade(a.grad[0], -0.05) : a.grad[0];
  const g1 = theme === "light" ? shade(a.grad[1], -0.05) : a.grad[1];
  return {
    "--color-accent": theme === "light" ? shade(a.solid, -0.26) : a.solid,
    "--color-accent-fill": fill,
    "--color-accent-grad-0": g0,
    "--color-accent-grad-1": g1,
    "--color-accent-soft":
      theme === "dark" ? alpha(a.solid, 0.16) : alpha(a.solid, 0.12),
    "--color-accent-border":
      theme === "dark" ? alpha(a.solid, 0.5) : alpha(a.solid, 0.4),
    "--color-on-accent": lum(fill) > 0.55 ? "#0b0d14" : "#ffffff",
    "--color-bubble-own":
      theme === "dark" ? alpha(fill, 0.3) : alpha(fill, 0.2),
    "--color-accent-glow": alpha(fill, 0.45),
    "--color-accent-dot": alpha(fill, 0.6),
    "--color-accent-wash":
      theme === "dark"
        ? alpha(a.solid, 0.2)
        : alpha(shade(a.solid, -0.26), 0.14),
  };
}

function block(selector, tokens) {
  const body = Object.entries(tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}

export function render() {
  const parts = [
    "/* DO NOT EDIT BY HAND — regenerate with: node scripts/gen-tokens.mjs",
    " * Math mirrors design/hf-kit.jsx skin() (v5 variant). */",
    // No-attribute fallbacks = tokyo (index.html sets data-accent, but keep
    // the cascade safe for first paint).
    block(":root", accentTokens("tokyo", "dark")),
    block(':root[data-theme="light"]', accentTokens("tokyo", "light")),
  ];
  for (const key of ACCENT_KEYS) {
    parts.push(block(`:root[data-accent="${key}"]`, accentTokens(key, "dark")));
    parts.push(
      block(
        `:root[data-theme="light"][data-accent="${key}"]`,
        accentTokens(key, "light"),
      ),
    );
  }
  return parts.join("\n\n");
}

const START = "/* @generated accents:start */";
const END = "/* @generated accents:end */";

export function inject(css, generated) {
  const s = css.indexOf(START);
  const e = css.indexOf(END);
  if (s === -1 || e === -1) {
    throw new Error("tokens.css is missing the @generated accents markers");
  }
  if (e < s) {
    throw new Error(
      "tokens.css @generated accents markers are in wrong order (end before start)",
    );
  }
  return css.slice(0, s + START.length) + "\n" + generated + "\n" + css.slice(e);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = fileURLToPath(new URL("../src/styles/tokens.css", import.meta.url));
  const css = readFileSync(path, "utf8");
  writeFileSync(path, inject(css, render()));
  console.log("tokens.css: @generated accents block rewritten");
}
