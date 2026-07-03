# Unit 10 Phase 1 — Kit Port + Primitive Parity Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port every prototype primitive into a typed, tokenized `src/ui/kit/`, each one pixel-gated against its prototype twin by a throwaway Playwright + pixelmatch harness before the phase exits.

**Architecture:** Two gallery pages render the same cell list — one drives the real prototype code (`design/hf-kit.jsx` + `design/proto-ui.jsx`, esbuild-transformed at harness build time, plus verbatim copies of proto.jsx-local primitives), the other renders the new kit inside the app's token pipeline. A runner screenshots each cell on both sides and pixel-diffs them. A cell passes at ≤0.2% differing pixels (per-cell overrides allowed). Kit components are pure (no Jazz/router imports — guard-enforced).

**Tech Stack:** React 19, TypeScript strict, Tailwind v3 tokens (Phase 0), esbuild (vite dep), playwright-core (nix browsers), pixelmatch + pngjs (new devDeps).

**Spec:** `docs/superpowers/specs/2026-07-03-unit-10-prototype-transliteration-design.md` §5–§6
**Law:** `docs/superpowers/specs/2026-07-03-unit-10-style-token-map.md` (extended by Task 2)

**Branch:** `unit-10/phase-1-kit` off current `main`; merges `--no-ff` when done.

---

## Ground rules (read before any task)

1. **Component names mirror the prototype exactly** (`PButton`, `HAv`, `Fab`, `ArcanMark`, …) for traceability. Files kebab-case in `src/ui/kit/`.
2. **Transliteration rules** from the spec §8 apply: node-for-node trees, mapping-table utilities only, copy text/casing verbatim, sanctioned deviations only (a11y attrs, testids, omitted presence/typing/delivery).
3. The prototype has **no hover/pressed CSS states** (inline styles can't express them) — parity states are *prop* states. Do not invent hover styles in Phase 1. `focus-visible` outlines are allowed (a11y, non-visual at rest).
4. **`TypingRow` is NOT ported** (typing indicators dropped — NOX-31/32/33). The phone bezel, `9:41` status bar, and home-indicator strip in `MobileApp` are demo stage dressing — NOT ported.
5. Size-scaled values (e.g. HAv's `font: 600 ${size*0.34}px/1`) stay computed inline styles; fixed structural px metrics stay literal per the mapping table.
6. Every command runs inside nix-shell: `nix-shell --run '<cmd>'`.
7. Implementers work on branch `unit-10/phase-1-kit`, never switch branches, commit per task.

## The Primitive Task Loop (referenced by Tasks 4–13; every step still applies each time)

1. Add the cell entries to `tests/parity/cells.json`.
2. Add the prototype-side cells to `tests/parity/proto-cells.jsx` (use `window.*` primitives from hf-kit/proto-ui; for proto.jsx-local primitives paste the verbatim copy given in the task).
3. Run `nix-shell --run 'npm run parity -- --only <cell-ids>'` — expect each new cell to FAIL with "missing app cell" (this is the failing test).
4. Write the kit component(s) in `src/ui/kit/`, exporting from `src/ui/kit/index.ts`.
5. Add the app-side cells to `tests/parity/app-gallery/cells.tsx`.
6. Re-run the same parity command. Iterate on the kit component until every cell passes (inspect `tests/parity/report/**` triptychs to see what's off). Never "fix" by editing the proto side to match the kit — the proto side is the truth.
7. Run `nix-shell --run 'npx tsc --noEmit && npm run check-tokens && npm run check-ui-purity'`.
8. Commit kit file(s) + gallery additions + cells.json together.

---

### Task 1: `src/ui` scaffold + purity guard

**Files:**
- Create: `src/ui/kit/index.ts`
- Create: `scripts/check-ui-purity.sh`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Create the barrel**

`src/ui/kit/index.ts`:

```typescript
// src/ui/kit — the transliterated prototype kit (Unit 10 Phase 1).
// Every component here is a node-for-node port of its twin in
// design/proto-ui.jsx, design/hf-kit.jsx, or design/proto.jsx, styled
// exclusively through the mapping table
// (docs/superpowers/specs/2026-07-03-unit-10-style-token-map.md).
// Purity: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

export {};
```

(Exports accumulate as Tasks 4–13 land; the empty export keeps tsc happy.)

- [ ] **Step 2: The purity guard**

`scripts/check-ui-purity.sh`:

```bash
#!/usr/bin/env bash
# scripts/check-ui-purity.sh — src/ui must stay presentational.
# Rejects imports of Jazz, the router, or the legacy component tree.
set -euo pipefail

PATTERNS="from ['\"]@/jazz|from ['\"]jazz-tools|from ['\"]react-router|from ['\"]@/components"

hits=$(grep -rnE "$PATTERNS" src/ui --include="*.ts" --include="*.tsx" 2>/dev/null || true)

if [ -n "$hits" ]; then
  echo "❌ src/ui purity violation — presenters/kit take data via props only:"
  echo "$hits"
  exit 1
fi
echo "✓ src/ui is pure (no jazz / router / legacy component imports)"
```

`chmod +x scripts/check-ui-purity.sh`.

- [ ] **Step 3: npm script**

In `package.json` scripts, after `"check-tokens"`, add:

```json
    "check-ui-purity": "./scripts/check-ui-purity.sh",
```

- [ ] **Step 4: Verify + commit**

```bash
nix-shell --run 'npm run check-ui-purity && npx tsc --noEmit'
git add src/ui scripts/check-ui-purity.sh package.json
git commit -m "feat(ui): src/ui scaffold + purity guard"
```

---

### Task 2: Token + mapping-table extensions for Phase 1 primitives

**Files:**
- Modify: `scripts/gen-tokens.mjs`
- Modify: `tests/unit/gen-tokens.test.ts`
- Modify: `src/styles/tokens.css`
- Modify: `tailwind.config.ts`
- Modify: `docs/superpowers/specs/2026-07-03-unit-10-style-token-map.md`

These come from prototype code the Phase 0 sweep didn't cover (Fab, Toast, shells, HAv fg, ArcanMark contexts).

- [ ] **Step 1: TDD — extend the generator test first**

Append to the `accentTokens` describe block in `tests/unit/gen-tokens.test.ts`:

```typescript
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

  it("derives toast wash from text-safe accent (tokyo: dark .2, light .14)", () => {
    expect(accentTokens("tokyo", "dark")["--color-accent-wash"]).toBe(
      "rgba(122,162,247,0.2)",
    );
    expect(accentTokens("tokyo", "light")["--color-accent-wash"]).toBe(
      "rgba(90,120,183,0.14)",
    );
  });
```

Run `nix-shell --run 'npx vitest run tests/unit/gen-tokens.test.ts'` — expect the 3 new tests to FAIL.

- [ ] **Step 2: Extend `accentTokens()` in `scripts/gen-tokens.mjs`**

Inside the returned object, after `"--color-bubble-own"`, add (sources: `Fab` boxShadow `alpha(c.accentFill,.45)` proto.jsx:148; AuthShell/DesktopEmpty dot `alpha(c.accentFill,.6)` proto.jsx:574/665; Toast wash `alpha(col, dark .2 / light .14)` with `col = c.accent` proto.jsx:593-596):

```javascript
    "--color-accent-glow": alpha(fill, 0.45),
    "--color-accent-dot": alpha(fill, 0.6),
    "--color-accent-wash":
      theme === "dark"
        ? alpha(a.solid, 0.2)
        : alpha(shade(a.solid, -0.26), 0.14),
```

Run the test file again — all pass. Then `nix-shell --run 'node scripts/gen-tokens.mjs'` (regenerates tokens.css; run twice, second run no diff).

- [ ] **Step 3: Hand tokens in `src/styles/tokens.css`**

In `:root` after `--shadow-bubble: none;`:

```css
  --color-avatar-group-fg: #bb9af7;               /* HAv group initials (hf-kit:106) */
  --color-cosmic-dot: #bb9af7;                    /* violet accent dot (proto:575/666) */
  --color-green-wash: rgba(158, 206, 106, 0.2);   /* toast success wash: alpha(green,.2) */
  --color-red-wash: rgba(247, 118, 142, 0.2);     /* toast error wash */
  --color-neutral-wash: rgba(138, 147, 178, 0.2); /* toast neutral wash: alpha(text2,.2) */
  --shadow-toast: 0 10px 30px rgba(0, 0, 0, 0.55);   /* proto:595 */
  --shadow-window: 0 34px 90px rgba(0, 0, 0, 0.62);  /* DesktopWindow, proto:679 */
```

In `:root[data-theme="light"]` after `--shadow-bubble: ...;`:

```css
  --color-avatar-group-fg: #7a55c9;
  --color-cosmic-dot: #bb9af7;
  --color-green-wash: rgba(79, 138, 54, 0.14);   /* alpha(#4f8a36,.14) */
  --color-red-wash: rgba(214, 69, 93, 0.14);     /* alpha(#d6455d,.14) */
  --color-neutral-wash: rgba(60, 66, 90, 0.14);  /* alpha(#3c425a,.14) */
  --shadow-toast: 0 10px 30px rgba(40, 40, 60, 0.18);
  --shadow-window: 0 34px 90px rgba(40, 40, 60, 0.24);
```

In the type-ramp section after `--fs-ui-time: 8.5px;`:

```css
  --fs-ui-toast: 12px;      /* Toast text (proto:597) */
  --fs-ui-empty: 15px;      /* DesktopEmpty title (proto:669) */
  --fs-ui-empty-sub: 11.5px;/* DesktopEmpty sub (proto:670) */
  --fs-ui-chrome: 10px;     /* DesktopWindow title-bar pill (proto:684) */
```

After `--tracking-tab: 0.04em;`:

```css
  --tracking-avatar: -0.02em; /* HAv initials (hf-kit:110) */
```

- [ ] **Step 4: Tailwind exposure in `tailwind.config.ts`**

colors (after `'media-veil'`):

```typescript
        'avatar-group-fg': 'var(--color-avatar-group-fg)',
        'cosmic-dot': 'var(--color-cosmic-dot)',
        'green-wash': 'var(--color-green-wash)',
        'red-wash': 'var(--color-red-wash)',
        'neutral-wash': 'var(--color-neutral-wash)',
        'accent-wash': 'var(--color-accent-wash)',
```

boxShadow (after `'bubble'`):

```typescript
        'toast': 'var(--shadow-toast)',
        'window': 'var(--shadow-window)',
        'fab': '0 8px 22px var(--color-accent-glow)',
        'dot': '0 0 10px var(--color-accent-dot)',
```

fontSize (after `'ui-time'`):

```typescript
        'ui-toast': ['var(--fs-ui-toast)', { lineHeight: '1.3' }],
        'ui-empty': ['var(--fs-ui-empty)', { lineHeight: '1.3' }],
        'ui-empty-sub': ['var(--fs-ui-empty-sub)', { lineHeight: '1' }],
        'ui-chrome': ['var(--fs-ui-chrome)', { lineHeight: '1' }],
```

letterSpacing (after `tab`):

```typescript
        avatar: 'var(--tracking-avatar)',
```

- [ ] **Step 5: Append to the mapping table**

Append these rows to the "skin() fields → tokens" table in `docs/superpowers/specs/2026-07-03-unit-10-style-token-map.md`:

```markdown
| Fab glow `alpha(c.accentFill, .45)` | `shadow-fab` |
| cosmic dot glow `alpha(c.accentFill, .6)` | `shadow-dot` (dot itself `bg-arcan-accent-fill`) |
| fixed violet dot `#bb9af7`/`#7a55c9` | `bg-cosmic-dot` / HAv group fg `text-avatar-group-fg` |
| toast washes `alpha(col, .2/.14)` | `bg-{green,red,neutral,accent}-wash` |
| toast shadow | `shadow-toast` |
| DesktopWindow shadow | `shadow-window` |
```

And to the type-ramp table:

```markdown
| `500 12px/1.3` body (toast text) | `font-body font-medium text-ui-toast` |
| `600 15px/1.3` mono (empty-state title) | `font-mono font-semibold text-ui-empty` |
| `400 11.5px/1` body (empty-state sub) | `font-body text-ui-empty-sub` |
| `500 10px/1` mono `.04em` (window chrome) | `font-mono font-medium text-ui-chrome tracking-tab` |
| `600 size*.34px/1` mono `-.02em` (HAv initials) | `font-mono font-semibold tracking-avatar` + computed inline font-size |
```

And to "Component metrics stay literal": `Fab 52 (offset right/bottom 16), toast icon circle 22, DesktopWindow bar h 38 / traffic lights 11 (#e2696e #e6b450 #5fb87f — decorative constants, stay inline), phone-frame numbers are stage dressing (not ported)`.

- [ ] **Step 6: Verify + commit**

```bash
nix-shell --run 'npx vitest run && npx tsc --noEmit && npm run check-tokens'
git add scripts/gen-tokens.mjs tests/unit/gen-tokens.test.ts src/styles/tokens.css tailwind.config.ts docs/superpowers/specs/2026-07-03-unit-10-style-token-map.md
git commit -m "feat(tokens): Phase 1 primitive tokens (glows, washes, chrome ramp) + mapping rows"
```

---

### Task 3: Parity harness

**Files:**
- Create: `tests/parity/static-server.mjs`, `tests/parity/build-proto.mjs`, `tests/parity/react-shim.js`, `tests/parity/proto-gallery.html`, `tests/parity/proto-cells.jsx`, `tests/parity/cells.json`, `tests/parity/run-parity.mjs`
- Create: `parity.html` (repo root), `tests/parity/app-gallery/main.tsx`, `tests/parity/app-gallery/cells.tsx`
- Modify: `package.json` (devDeps + scripts), `.gitignore`

- [ ] **Step 1: Install devDeps**

```bash
nix-shell --run 'npm i -D pixelmatch pngjs'
```

- [ ] **Step 2: `tests/parity/cells.json`** — the single source of truth for what gets compared

```json
{
  "defaults": { "width": 340, "pad": 16, "bg": "bg", "themes": ["dark", "light"], "accents": ["tokyo"], "maxDiffRatio": 0.002 },
  "cells": [
    { "id": "probe-swatch" }
  ]
}
```

Schema: `id` (registry key both sides), optional `width`, `height`, `pad`, `bg` (`"bg" | "panel" | "stage"`), `themes`, `accents`, `maxDiffRatio`, `advisory` (report but never fail).

- [ ] **Step 3: `tests/parity/react-shim.js`**

```javascript
// Bundled by build-proto.mjs into an IIFE exposing the app's React 19 as
// window globals for the esbuild-transformed prototype sources.
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";

window.React = React;
window.ReactDOMClient = ReactDOMClient;
```

- [ ] **Step 4: `tests/parity/build-proto.mjs`**

```javascript
// Pre-transforms the prototype for the parity gallery (no CDN, no Babel):
//   vendor.js  = React 19 bundled as window globals
//   *.jsx      = esbuild JSX transform (classic runtime, window-global scripts)
import { build, transform } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
mkdirSync(here("./out"), { recursive: true });

await build({
  entryPoints: [here("./react-shim.js")],
  bundle: true,
  format: "iife",
  outfile: here("./out/vendor.js"),
  logLevel: "silent",
});

for (const f of ["../../design/hf-kit.jsx", "../../design/proto-ui.jsx", "./proto-cells.jsx"]) {
  const src = readFileSync(here(f), "utf8");
  const out = await transform(src, {
    loader: "jsx",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
  });
  const name = f.split("/").pop().replace(/\.jsx$/, ".js");
  writeFileSync(here(`./out/${name}`), out.code);
}
console.log("parity: prototype gallery built");
```

- [ ] **Step 5: `tests/parity/static-server.mjs`** — plain file server on the repo root (the prototype side must NOT go through vite transforms)

```javascript
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2",
  ".woff": "font/woff", ".png": "image/png", ".svg": "image/svg+xml", ".jsx": "text/plain",
};

export function serve(port) {
  const srv = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
      const file = join(ROOT, path);
      if (!file.startsWith(ROOT)) throw new Error("traversal");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((ok) => srv.listen(port, () => ok(srv)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await serve(4174);
  console.log("parity static server on :4174");
}
```

- [ ] **Step 6: `tests/parity/proto-gallery.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>parity — prototype side</title>
<style>
  /* Fonts: SAME fontsource files the app loads (weights: Inter 300–700, Mono 400–700). */
  @font-face { font-family: 'Inter'; font-weight: 300; src: url('/node_modules/@fontsource/inter/files/inter-latin-300-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Inter'; font-weight: 400; src: url('/node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Inter'; font-weight: 500; src: url('/node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Inter'; font-weight: 600; src: url('/node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Inter'; font-weight: 700; src: url('/node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2') format('woff2'); }
  @font-face { font-family: 'JetBrains Mono'; font-weight: 400; src: url('/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2') format('woff2'); }
  @font-face { font-family: 'JetBrains Mono'; font-weight: 500; src: url('/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2') format('woff2'); }
  @font-face { font-family: 'JetBrains Mono'; font-weight: 600; src: url('/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2') format('woff2'); }
  @font-face { font-family: 'JetBrains Mono'; font-weight: 700; src: url('/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2') format('woff2'); }
  html, body { margin: 0; background: #333; }
  * { box-sizing: border-box; }
  button { font-family: inherit; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
</style>
</head>
<body>
<div id="cells"></div>
<script src="/tests/parity/out/vendor.js"></script>
<script src="/design/lattice.js"></script>
<script src="/tests/parity/out/hf-kit.js"></script>
<script src="/tests/parity/out/proto-ui.js"></script>
<script src="/tests/parity/out/proto-cells.js"></script>
</body>
</html>
```

- [ ] **Step 7: `tests/parity/proto-cells.jsx`** — registry + renderer (probe cell only; Tasks 4–13 append)

```jsx
// Prototype-side parity cells. `s` is the live v5 skin for the requested
// theme/accent. Cells must mirror tests/parity/app-gallery/cells.tsx exactly.
// Verbatim copies of proto.jsx-local primitives accumulate here (each marked
// with its design/proto.jsx line range).
const { skin, alpha } = window;

const PROTO_CELLS = {
  "probe-swatch": (s) => (
    <div style={{ width: 200, height: 64, borderRadius: s.radius, border: `1px solid ${s.c.border}`, background: s.c.panel, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ font: `500 12.5px/1.2 ${s.font}`, color: s.c.text }}>probe // arcan</span>
    </div>
  ),
};

(async () => {
  const params = new URLSearchParams(location.search);
  const theme = params.get("theme") || "dark";
  const accent = params.get("accent") || "tokyo";
  const s = skin("v5", theme, accent);
  const spec = await (await fetch("/tests/parity/cells.json")).json();
  const bgOf = (name) => ({ bg: s.c.bg, panel: s.c.panel, stage: s.c.stage })[name || "bg"];

  const root = window.ReactDOMClient.createRoot(document.getElementById("cells"));
  root.render(
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
      {spec.cells.map((cell) => {
        const render = PROTO_CELLS[cell.id];
        const d = spec.defaults;
        return (
          <div key={cell.id} data-cell={cell.id}
            style={{ width: cell.width ?? d.width, height: cell.height, padding: cell.pad ?? d.pad, background: bgOf(cell.bg ?? d.bg), overflow: "hidden", position: "relative" }}>
            {render ? render(s) : <span style={{ color: "red" }}>MISSING PROTO CELL: {cell.id}</span>}
          </div>
        );
      })}
    </div>,
  );
  await document.fonts.ready;
  // double-rAF so React commit + fonts settle before the runner screenshots
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.setAttribute("data-gallery-ready", "1");
  }));
})();
```

- [ ] **Step 8: app side — `parity.html` (repo root; dev-only page, never a build input)**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>parity — app side</title>
  </head>
  <body>
    <div id="cells"></div>
    <script type="module" src="/tests/parity/app-gallery/main.tsx"></script>
  </body>
</html>
```

`tests/parity/app-gallery/main.tsx`:

```tsx
// App-side parity gallery. Mirrors tests/parity/proto-cells.jsx.
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "@/styles/tokens.css";
import "@/index.css";
import { createRoot } from "react-dom/client";
import { APP_CELLS } from "./cells";
import spec from "../cells.json";

const params = new URLSearchParams(location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") || "dark");
document.documentElement.setAttribute("data-accent", params.get("accent") || "tokyo");

const style = document.createElement("style");
style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important} html,body{margin:0;background:#333}";
document.head.appendChild(style);

const BG: Record<string, string> = { bg: "bg-bg", panel: "bg-panel", stage: "bg-bg-stage" };
const d = spec.defaults;

createRoot(document.getElementById("cells")!).render(
  <div className="flex flex-col gap-6 p-6">
    {spec.cells.map((cell: any) => {
      const render = (APP_CELLS as any)[cell.id];
      return (
        <div key={cell.id} data-cell={cell.id}
          className={`overflow-hidden relative ${BG[cell.bg ?? d.bg]}`}
          style={{ width: cell.width ?? d.width, height: cell.height, padding: cell.pad ?? d.pad }}>
          {render ? render() : <span style={{ color: "red" }}>MISSING APP CELL: {cell.id}</span>}
        </div>
      );
    })}
  </div>,
);

document.fonts.ready.then(() =>
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.body.setAttribute("data-gallery-ready", "1")),
  ),
);
```

`tests/parity/app-gallery/cells.tsx` (probe only; Tasks 4–13 append):

```tsx
import type { ReactNode } from "react";

export const APP_CELLS: Record<string, () => ReactNode> = {
  "probe-swatch": () => (
    <div className="w-[200px] h-16 rounded-r-4 border border-hairline bg-panel flex items-center justify-center">
      <span className="font-mono font-medium text-ui-row text-text">probe {"//"} arcan</span>
    </div>
  ),
};
```

- [ ] **Step 9: `tests/parity/run-parity.mjs`**

```javascript
// Parity runner: builds the proto gallery, boots both servers, screenshots
// every cell on both sides for every theme/accent variant, pixel-diffs.
// Usage: npm run parity [-- --only cell-a,cell-b]
import { spawn, execSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pixelmatch = require("pixelmatch");
const { PNG } = require("pngjs");
const cellsSpec = require("./cells.json");

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const only = (process.argv.find((a) => a.startsWith("--only")) || "").split("=")[1]
  ?? (process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null);
const wanted = only ? only.split(",") : null;

execSync(`node ${here("./build-proto.mjs")}`, { stdio: "inherit" });
const { serve } = await import("./static-server.mjs");
const staticSrv = await serve(4174);
const vite = spawn("npx", ["vite", "--port", "4175", "--strictPort"], {
  cwd: here("../.."), stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 2500));

const REPORT = here("./report");
rmSync(REPORT, { recursive: true, force: true });
mkdirSync(REPORT, { recursive: true });

const d = cellsSpec.defaults;
const cells = cellsSpec.cells.filter((c) => !wanted || wanted.includes(c.id));
const variants = new Map(); // "theme/accent" -> cells
for (const cell of cells) {
  for (const theme of cell.themes ?? d.themes) {
    for (const accent of cell.accents ?? d.accents) {
      const k = `${theme}/${accent}`;
      if (!variants.has(k)) variants.set(k, []);
      variants.get(k).push(cell);
    }
  }
}

const browser = await chromium.launch();
const results = [];
try {
  for (const [variant, vcells] of variants) {
    const [theme, accent] = variant.split("/");
    const q = `?theme=${theme}&accent=${accent}`;
    const proto = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
    const app = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
    await proto.goto(`http://localhost:4174/tests/parity/proto-gallery.html${q}`);
    await app.goto(`http://localhost:4175/parity.html${q}`);
    await proto.waitForSelector('body[data-gallery-ready="1"]', { timeout: 15000 });
    await app.waitForSelector('body[data-gallery-ready="1"]', { timeout: 15000 });

    const dir = `${REPORT}/${theme}-${accent}`;
    mkdirSync(dir, { recursive: true });
    for (const cell of vcells) {
      const sel = `[data-cell="${cell.id}"]`;
      const [pBuf, aBuf] = [
        await proto.locator(sel).screenshot(),
        await app.locator(sel).screenshot(),
      ];
      const pImg = PNG.sync.read(pBuf);
      const aImg = PNG.sync.read(aBuf);
      let status, ratio = 1;
      if (pImg.width !== aImg.width || pImg.height !== aImg.height) {
        status = `SIZE ${pImg.width}x${pImg.height} vs ${aImg.width}x${aImg.height}`;
      } else {
        const diff = new PNG({ width: pImg.width, height: pImg.height });
        const n = pixelmatch(pImg.data, aImg.data, diff.data, pImg.width, pImg.height, { threshold: 0.1 });
        ratio = n / (pImg.width * pImg.height);
        writeFileSync(`${dir}/${cell.id}-diff.png`, PNG.sync.write(diff));
        status = ratio <= (cell.maxDiffRatio ?? d.maxDiffRatio) ? "PASS" : "FAIL";
      }
      writeFileSync(`${dir}/${cell.id}-proto.png`, pBuf);
      writeFileSync(`${dir}/${cell.id}-app.png`, aBuf);
      const failing = status !== "PASS" && !cell.advisory;
      results.push({ variant, id: cell.id, status: cell.advisory && status !== "PASS" ? `ADVISORY(${status})` : status, ratio, failing });
      console.log(`${failing ? "✗" : "✓"} [${variant}] ${cell.id}: ${status} (${(ratio * 100).toFixed(3)}%)`);
    }
    await proto.close();
    await app.close();
  }
} finally {
  await browser.close();
  vite.kill();
  staticSrv.close();
}

const failures = results.filter((r) => r.failing);
console.log(`\nparity: ${results.length - failures.length}/${results.length} pass — report at tests/parity/report/`);
if (failures.length) process.exit(1);
```

- [ ] **Step 10: npm script + gitignore**

package.json scripts: `"parity": "node tests/parity/run-parity.mjs",`
`.gitignore`: add `tests/parity/report/` and `tests/parity/out/`.

- [ ] **Step 11: Prove the loop end-to-end**

```bash
nix-shell --run 'npm run parity'
```

Expected: `probe-swatch` PASSES in dark/tokyo and light/tokyo (2/2). If it fails on font rendering, inspect the triptych — the probe exists precisely to calibrate before any real primitive. Iterate on harness (not thresholds) until the probe is clean.

- [ ] **Step 12: tsc + commit**

```bash
nix-shell --run 'npx tsc --noEmit && npx vitest run'
git add tests/parity parity.html package.json package-lock.json .gitignore
git commit -m "feat(parity): prototype-vs-kit pixel harness (esbuild galleries + runner)"
```

---

### Task 4: `Icon` (+ `IPATHS`)

**Kit file:** `src/ui/kit/icon.tsx` — port of `design/hf-kit.jsx` lines 115–146 (30 paths + Icon component).

Interface:

```typescript
export type IconName = "search" | "plus" | "gear" | "back" | "chev" | "send" | "plusc" | "image" | "paperclip" | "chat" | "people" | "pencil" | "copy" | "share" | "camera" | "check" | "dots" | "bell" | "at" | "device" | "key" | "shield" | "logout" | "sun" | "moon" | "sparkle" | "alert" | "refresh" | "close" | "message";
export function Icon(props: { d: IconName; className?: string; size?: number; sw?: number; fill?: boolean }): JSX.Element;
```

Port notes: copy every path string byte-for-byte from IPATHS (hf-kit:115–143). Color flows via `className` (`text-*` utility) + SVG `stroke="currentColor"`/`fill="currentColor"` instead of the prototype's `c` prop — pixel-identical, keeps tokens in class space. `aria-hidden="true"` stays.

**Cells** (append to cells.json / both registries):

```json
{ "id": "icon-grid" },
{ "id": "icon-modes" }
```

- `icon-grid`: all 30 IconName values at size 18, `text-text-2` (proto: `c.text2`), flex-wrapped gap 8.
- `icon-modes`: row of: send filled (`fill`, 16), chev 15 dim, gear 20 text2, plus 24 sw 2.2 on-accent inside a 52px `bg-arcan-accent-fill` pill (fab preview).

- [ ] Follow the Primitive Task Loop (steps 1–8). Commit: `feat(kit): Icon primitive (30-path prototype icon set) + parity cells`

---

### Task 5: `HAv` (avatar)

**Kit file:** `src/ui/kit/hav.tsx` — port of hf-kit:103–114.

Interface:

```typescript
export function HAv(props: { txt: string; size?: number; group?: boolean; status?: "online" | "offline"; ring?: string; className?: string }): JSX.Element;
```

Port notes: `size` default 34; radius `rounded-avatar` (10) — NOT size-scaled; bg `bg-avatar-group`/`bg-accent-soft`; fg `text-avatar-group-fg`/`text-arcan-accent`; border `border-hairline`; initials font `font-mono font-semibold tracking-avatar` with computed inline `fontSize: Math.round(size*0.34)`, `lineHeight: 1`; status dot `Math.max(8, Math.round(size*0.28))`, `bg-green`/`bg-dim`, ring = 2px solid ring color (prop, default `var(--color-bg)` via inline style — it's a paint value, keep inline).

**Cells:** `hav-sizes` (28, 34, 38 side by side), `hav-group` (group 34 + group 38), `hav-status` (38 online ring bg, 38 offline ring bg) — status cells on `bg` background so the ring contrast matches proto (`ring={c.bg}`).

- [ ] Primitive Task Loop. Commit: `feat(kit): HAv avatar + parity cells`

---

### Task 6: `PButton` + `tapBtn` base

**Kit files:** `src/ui/kit/tap.ts` (the `tapBtn` reset as a shared class string), `src/ui/kit/pbutton.tsx` — port of proto-ui:42 + proto-ui:87–99.

```typescript
// tap.ts
export const tapClass = "border-none bg-transparent p-0 m-0 cursor-pointer flex items-center [-webkit-tap-highlight-color:transparent]";
// pbutton.tsx
export function PButton(props: { label: string; icon?: IconName; primary?: boolean; danger?: boolean; ghost?: boolean; full?: boolean; onClick?: () => void; className?: string; "data-testid"?: string }): JSX.Element;
```

Port notes: height 44 (`h-11`), `rounded-pill` (v5 soft), `justify-center gap-2` (8), font `font-mono font-semibold text-ui-btn`; variants per mapping table (primary `bg-arcan-accent-fill text-on-accent`; danger `text-red border border-red-border`; ghost `text-text-2`; default outline `text-text border border-hairline`); `full` → `w-full` else `px-[18px]`; icon size 16, `fill` when `icon === "send"`.

**Cells:** `pbutton-variants` (primary/outline/danger/ghost stacked, gap 10), `pbutton-full` (full primary + full primary with send icon), both with `"accents": ["tokyo", "rose"]`.

- [ ] Primitive Task Loop. Commit: `feat(kit): PButton + tap base + parity cells`

---

### Task 7: `PCard`, `PSectionLabel`, `PRow`

**Kit files:** `src/ui/kit/pcard.tsx`, `src/ui/kit/psection-label.tsx`, `src/ui/kit/prow.tsx` — ports of proto-ui:64–86.

```typescript
export function PCard(props: { children: ReactNode; className?: string; "data-testid"?: string }): JSX.Element;
export function PSectionLabel(props: { children: ReactNode }): JSX.Element;
export function PRow(props: { icon?: IconName; iconClassName?: string; label: string; sub?: string; value?: string; right?: ReactNode; onClick?: () => void; danger?: boolean; last?: boolean; "data-testid"?: string }): JSX.Element;
```

Port notes: PCard = mapping-table cluster verbatim (`rounded-r-5 border border-hairline bg-panel overflow-hidden`). PSectionLabel: wrapper `pt-0.5 px-1 pb-2` (proto `2px 4px 8px`), label `font-mono font-semibold text-ui-caps tracking-caps uppercase text-dim`, literal `// ` prefix (v5 `sysComment`). PRow: `w-full text-left flex items-center gap-3 px-3.5 py-3` (proto `12px 14px`), bottom hairline unless `last`; icon 17 (`text-red` when danger, else `iconClassName ?? "text-text-2"`); label `font-body font-medium text-ui-row` (`text-red` when danger, else `text-text`); sub `mt-[3px] font-body text-ui-sub text-dim`; value `font-mono text-ui-value text-dim`; trailing chev 15 `text-dim` when `onClick && !right && !value`; non-clickable rows get `cursor-default`.

**Cells:** `pcard-rows` — PSectionLabel "security" above a PCard with 4 PRows (no forward deps on Task 8): (key icon, label "recovery code" + sub "view or rotate", chev), (label "link valid for" + value "24h"), (shield icon, label "verified devices", chev), (logout icon, label "sign out", danger, last).

- [ ] Primitive Task Loop. Commit: `feat(kit): PCard/PSectionLabel/PRow + parity cells`

---

### Task 8: `PField`, `PToggle`, `PQR`

**Kit files:** `src/ui/kit/pfield.tsx`, `src/ui/kit/ptoggle.tsx`, `src/ui/kit/pqr.tsx` — ports of proto-ui:100–130.

```typescript
export function PField(props: { label?: string; ph?: string; value?: string; mono?: boolean }): JSX.Element;
export function PToggle(props: { on: boolean; onClick?: () => void; "aria-label"?: string }): JSX.Element;
export function PQR(props: { size?: number }): JSX.Element;
```

Port notes: PField: column gap 6; label `font-mono font-semibold text-ui-caps tracking-caps-sm uppercase text-dim`; box = mapping cluster (`h-10 rounded-r-4 border border-hairline bg-panel flex items-center px-3`); value text `text-ui-row leading-none`, `font-mono` when `mono`, `text-text` when value else `text-dim` showing `ph`. (Display-only in the prototype; a real input variant is a Wave concern — do not add one now, YAGNI.) PToggle: track 38×22 `rounded-pill`, on `bg-arcan-accent-fill` / off `bg-panel-2 border border-hairline`; knob 16 absolute top-[2px], left 2→18, `bg-on-accent` on / `bg-text-2` off, `transition-[left] duration-switch` — transitions are disabled in galleries, so parity sees end states. PQR: box `rounded-r-4 border border-hairline bg-bg` size default 128; inner 5×5 grid gap 3 at 62% size; filled module indexes exactly `[0,1,4,5,6,8,12,16,18,19,20,23,24,3,10,14]`, modules `rounded-[1px] bg-text`.

**Cells:** `pfield` (label+ph, label+value, mono value stacked gap 12, on `panel`? proto Fields sit on bg — use default bg), `ptoggle` (on + off, accents tokyo+rose), `pqr` (128).

- [ ] Primitive Task Loop. Commit: `feat(kit): PField/PToggle/PQR + parity cells`

---

### Task 9: `Body`, `PHeader`, `PTabBar`

**Kit files:** `src/ui/kit/body.tsx`, `src/ui/kit/pheader.tsx`, `src/ui/kit/ptabbar.tsx` — ports of proto-ui:11–61.

```typescript
export function Body(props: { children: ReactNode; pad?: number; className?: string }): JSX.Element;
export function PHeader(props: { title: string; sub?: ReactNode; onBack?: () => void; avatar?: ReactNode; onAvatar?: () => void; onTitle?: () => void; right?: ReactNode }): JSX.Element;
export function PTabBar(props: { active: "chats" | "contacts"; onTab: (t: "chats" | "contacts") => void }): JSX.Element;
```

Port notes: Body = `flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-bg` + inline padding. PHeader: cluster verbatim (`min-h-[52px] flex items-center gap-[11px] px-3 border-b border-hairline bg-bg`); title `font-mono font-bold text-ui-title tracking-title truncate` (headMono true); sub row `mt-0.5 flex items-center gap-[5px]`; back button = tap + Icon back 20 text2; onTitle wraps avatar+title in one tap button (`flex-1 min-w-0 gap-[11px] text-left`). PTabBar: cluster verbatim (`h-[54px] flex items-stretch border-t border-hairline bg-bg`); each tab = tap + `flex-1 flex-col justify-center gap-[3px] py-[7px]`; icon 20 (`chat`/`people`) + label `font-mono text-ui-tab tracking-tab`, active `text-arcan-accent font-semibold` / inactive `text-dim font-medium`.

**Cells:** `pheader-plain` (title "decima" + avatar HAv 30 + right gear icon button — proto ChatsScreen header shape, proto.jsx:90–91), `pheader-back` (back + title "settings" + sub `<span>` `text-ui-sub text-dim` "manage your account"), `pheader-ontitle` (avatar HAv 30 + title "ada · keyring" + onTitle set + right dots icon), `ptabbar` (active chats), `ptabbar-contacts` (active contacts). Header cells: `pad: 0`, width 340.

- [ ] Primitive Task Loop. Commit: `feat(kit): Body/PHeader/PTabBar + parity cells`

---

### Task 10: `Bubble` + `MessageRow` (+ sys/new rows)

**Kit file:** `src/ui/kit/bubble.tsx` — port of proto.jsx:33–71 (`ownPaintP`, `Bubble`, `Row`). NO TypingRow.

```typescript
export interface BubbleMsg { who: "me" | "them" | "sys" | "new"; text?: string; name?: string; ini?: string; time?: string; att?: boolean; }
export function Bubble(props: { m: BubbleMsg; w: number }): JSX.Element;
export function MessageRow(props: { m: BubbleMsg; w: number }): JSX.Element; // proto's `Row`
```

Port notes (v5: ownStyle tint, fam noir, bubbleRadius 14, soft true):
- own paint: `bg-bubble-own border border-accent-border text-text`, time `text-dim`; theirs: `bg-panel border border-hairline text-text shadow-bubble`, time `text-dim`.
- radius `rounded-r-5`, tail corner `rounded-br-r-1` (own) / `rounded-bl-r-1` (theirs); padding `8px 11px` (`px-[11px] py-2`), attachment variant padding 6 (`p-1.5`).
- attachment block: `w = w-12`px × h-[84px], `rounded-[8px]`, own `bg-media-veil` / theirs `bg-rail`, centered image icon 20 (own: `text-white/80` — proto `alpha('#fff',.8)`; use `text-media-veil`? No: that's 0.18 — use arbitrary-free approach: add nothing, the icon color own-side is `rgba(255,255,255,.8)` → use `text-white/80`; `text-white` is NOT in check-tokens' banned list and matches the veil's fixed-white family), margin-bottom 5.
- text row: `flex items-end gap-2`; text `flex-1 font-body text-ui-bubble`; time `font-mono font-medium text-ui-time shrink-0 mb-px`.
- MessageRow: mine `flex-row-reverse`; theirs shows HAv 28 + optional author name `font-mono font-semibold text-ui-tab text-text-2 ml-[3px]`; column `gap-[3px] max-w-[80%]` aligned by side.
- sys row: `self-center font-mono text-ui-sys text-dim text-center py-0.5` with `// ` prefix.
- new divider: two `flex-1 h-px bg-arcan-accent opacity-50` lines + label `font-mono font-semibold text-ui-caps tracking-caps uppercase text-arcan-accent`, row `flex items-center gap-2.5 my-0.5`.

**Prototype-side verbatim copy for proto-cells.jsx** (paste as-is, marked `/* proto.jsx:33–71 */`): the `ownPaintP`, `Bubble`, `Row` functions exactly as they appear in design/proto.jsx lines 33–71.

**Cells** (width 300, bg `bg`): `bubble-own` (me: "nice. shipping it tonight." time 9:22, w 220), `bubble-theirs` (Row them: name ada, ini AK, "schema diff looks good — merging now", 9:18, w 220), `bubble-att` (me att: "sow-042.png" 9:22, w 220), `bubble-sys` (sys: "conversation created · end-to-end encrypted"), `bubble-new` (new divider), accents tokyo+rose for `bubble-own`.

- [ ] Primitive Task Loop. Commit: `feat(kit): Bubble/MessageRow chat primitives + parity cells`

---

### Task 11: `Fab` + `Toast`

**Kit files:** `src/ui/kit/fab.tsx`, `src/ui/kit/toast.tsx` — ports of proto.jsx:145–152 and proto.jsx:590–600.

```typescript
export function Fab(props: { onClick?: () => void; "aria-label"?: string; "data-testid"?: string }): JSX.Element;
export type KitToastTone = "neutral" | "success" | "error" | "accent";
export function KitToast(props: { text: string; icon?: IconName; tone?: KitToastTone }): JSX.Element;
```

Port notes: Fab = tap + `absolute right-4 bottom-4 w-[52px] h-[52px] rounded-pill bg-arcan-accent-fill justify-center shadow-fab z-[4]`, plus icon 24 sw 2.2 `text-on-accent`. Toast (named KitToast to avoid clashing with the legacy toast until Phase 4): `absolute left-3.5 right-3.5 bottom-[18px] z-30 flex items-center gap-2.5 px-3.5 py-[11px] rounded-r-5 bg-panel border border-hairline shadow-toast`; icon circle 22 `rounded-pill` wash by tone (`bg-neutral-wash`/`bg-green-wash`/`bg-red-wash`/`bg-accent-wash`), Icon 13 colored `text-text-2`/`text-green`/`text-red`/`text-arcan-accent`; text `flex-1 font-body font-medium text-ui-toast text-text`. Entry animation is disabled in galleries; port the animation class using the existing `arcan-toast-in` keyframes with duration `.3s` ease `cubic-bezier(.2,.8,.2,1)` (proto:595).

**Prototype-side verbatim copies:** `Fab` (proto.jsx:145–152), `Toast` (proto.jsx:590–600).

**Cells:** `fab` (width 120 height 120, pad 0, relative container), `toast-tones` (4 KitToasts stacked in relative containers h-[64px] each: neutral bell "saved", success check "invite link copied", error alert "couldn't load invite", accent copy "code copied"; accents tokyo+rose).

- [ ] Primitive Task Loop. Commit: `feat(kit): Fab + KitToast + parity cells`

---

### Task 12: `ArcanMark` + Lattice verdict

**Kit file:** `src/ui/kit/arcan-mark.tsx` — port of hf-kit:195–241, geometry ported fresh from `design/lattice.js` into `src/ui/kit/lattice-paths.ts` (pure string builders `full/reduced/minimal/glyph`, port the generator functions `pc/ring/ticks/dots/seg/hexPoly/spokes6` byte-for-byte).

```typescript
export function ArcanMark(props: { size?: number; showWord?: boolean; mono?: boolean; stacked?: boolean; className?: string }): JSX.Element;
```

Port notes: tier from size (≥44 full, ≥26 reduced, ≥18 minimal, else glyph); gradient fill via `<linearGradient>` with `useId()` (React 19) using `var(--color-accent-grad-0/1)` as stop colors; `mono` → `currentColor` (color via className); wordmark spans copy the size-scaled fonts inline (`0.74*size` / stacked `0.26*size` with `0.5em` tracking uppercase). No LATTICE polling (geometry is imported, always present).

**Cells:** `arcanmark-tiers` (58 stacked, 24 with word, 12 mono no-word in a row, gap 24), `arcanmark-accents` (24 with word; accents tokyo+rose).
**Verdict cell:** `lattice-verdict` with `"advisory": true` — app side renders the EXISTING `src/components/lattice` `<Lattice size={58} />`… **purity guard forbids `@/components` in src/ui, but the gallery is tests/, not src/ui — import it directly in `cells.tsx`**; proto side renders `ArcanMark s size 58 showWord={false}` (glyph only, no word). The diff ratio decides: if ≤0.002 the existing Lattice is pixel-true (record verdict KEEP in the commit message and coverage manifest later); else the kit's ArcanMark supersedes it in Wave usage (verdict REPLACE).

- [ ] Primitive Task Loop. Commit: `feat(kit): ArcanMark + lattice geometry + Lattice verdict (<KEEP|REPLACE>)`

---

### Task 13: Shells — `AuthShell`, `DesktopEmpty`, `DesktopWindow`, `MobileShell`

**Kit files:** `src/ui/kit/auth-shell.tsx`, `src/ui/kit/desktop-empty.tsx`, `src/ui/kit/desktop-window.tsx`, `src/ui/kit/mobile-shell.tsx` — ports of proto.jsx:567–579, 658–673, 676–691, and MobileApp's inner chrome (proto.jsx:642–649, EXCLUDING bezel/status-bar/home-indicator dressing).

```typescript
export function AuthShell(props: { children: ReactNode }): JSX.Element;
export function DesktopEmpty(props: { tab: "chats" | "contacts" }): JSX.Element;
export function DesktopWindow(props: { children: ReactNode; narrow?: boolean }): JSX.Element;
export function MobileShell(props: { children: ReactNode; tabBar?: ReactNode; toast?: ReactNode }): JSX.Element;
```

Port notes:
- AuthShell: `flex-1 min-h-0 relative flex items-center justify-center bg-bg overflow-hidden`; watermark = 320 SVG of `latticePaths.full("currentColor")` positioned `right-[-74px] bottom-[-86px] text-text`, opacity via inline `style={{ opacity: "var(--opacity-watermark)" }}` — this task adds the hand tokens `--opacity-watermark: 0.05;` (`:root`) and `0.06` (light block) to tokens.css and a row to the mapping table (prototype: 0.05 dark / 0.06 light, proto.jsx:572); two cosmic dots: 4px `bg-arcan-accent-fill shadow-dot` at left 22% top 20%, 3px `bg-cosmic-dot` at right 24% top 26%; content column `w-[280px] max-w-[86%] flex flex-col gap-[13px] relative p-[18px]`.
- DesktopEmpty: same watermark pattern (360, right -84, bottom -96, dots at 30%/28% and 32%/34%), `ArcanMark size 58 stacked`, title `font-mono font-semibold text-ui-empty text-text-2` ("select a contact" / "select a conversation"), sub `mt-1.5 font-body text-ui-empty-sub text-dim` with `// end-to-end encrypted` (sysComment).
- DesktopWindow: `rounded-[14px] overflow-hidden border border-hairline bg-bg shadow-window flex flex-col`, sizes `narrow ? min(520px,92vw)×min(620px,88vh) : min(1200px,95vw)×min(88vh,820px)` (inline style — responsive min() metrics); title bar h-[38px] `flex items-center gap-2 px-3.5 border-b border-hairline bg-panel`; traffic lights 11px `rounded-pill opacity-90` with literal hexes (decorative constants); centered pill `flex items-center gap-[7px] px-3.5 py-1 rounded-pill bg-bg border border-hairline` containing `ArcanMark size 12 mono showWord={false}` + `font-mono font-medium text-ui-chrome tracking-tab text-dim` "arcan · local-first"; right spacer w-[52px].
- MobileShell: `flex-1 min-h-0 flex flex-col relative overflow-hidden bg-bg` with screen area `flex-1 min-h-0 relative` + children, then `tabBar` slot, then `toast` overlay slot. (Push/pop animation classes are Wave A integration.)

**Prototype-side verbatim copies:** AuthShell (proto.jsx:567–579), DesktopEmpty (658–673), DesktopWindow (676–691), and for `mobile-shell` build the proto cell from `Body` + `PTabBar` + a fixed-height wrapper mirroring proto.jsx:642–649 minus dressing.

Cells.json additions (heights explicit):

```json
{ "id": "auth-shell", "width": 360, "height": 480, "pad": 0 },
{ "id": "desktop-empty", "width": 640, "height": 480, "pad": 0 },
{ "id": "desktop-window", "width": 620, "height": 700, "pad": 24, "bg": "stage" },
{ "id": "mobile-shell", "width": 300, "height": 560, "pad": 0 }
```

- auth-shell child sample: PField (label "email", ph "you@domain.dev") + full primary PButton "sign in".
- desktop-window: narrow variant with DesktopEmpty(chats) child.
- mobile-shell: Body with one PCard row + PTabBar active chats + a KitToast visible.

Watch out: `min(92vw)`-style sizes resolve against the 1400px viewport, not the cell — for the parity cells pass explicit inline `width/height` overrides through `className`-free style props on DesktopWindow? NO — keep the component verbatim (min() formulas) and give the CELL a wrapper that constrains vw via a fixed-size container: min(520px, 92vw) at 1400px viewport = 520px — the min() already resolves to the fixed operand at this viewport on BOTH sides identically. No override needed.

- [ ] Primitive Task Loop. Commit: `feat(kit): shells (AuthShell/DesktopEmpty/DesktopWindow/MobileShell) + parity cells`

---

### Task 14: Phase exit — full parity run, battery, merge

- [ ] **Step 1: Full parity run**

```bash
nix-shell --run 'npm run parity'
```

Expected: every non-advisory cell PASS across dark/light (and rose where declared). Fix any stragglers (kit side only).

- [ ] **Step 2: Full battery**

```bash
nix-shell --run 'npx tsc --noEmit && npm run check-tokens && npm run check-ui-purity && npx vitest run && npx vite build'
```

- [ ] **Step 3: Update CLAUDE.md dependency note**

In CLAUDE.md Conventions, the line claiming "React 18" is stale — the app is on React 19.2.6 (discovered this phase). Update: `TypeScript everywhere; strict; React 19; Tailwind v3 (not v4 — shadcn compat)`.

- [ ] **Step 4: Merge**

```bash
git checkout main && git merge --no-ff unit-10/phase-1-kit \
  -m "Unit 10 Phase 1: prototype kit port + primitive parity harness"
```

---

## Self-review notes

- Task ordering respects dependencies: Icon → HAv → PButton (icons) → cards/fields → header/tabbar (uses HAv/Icon in cells) → Bubble (HAv) → Fab/Toast (Icon) → ArcanMark → shells (ArcanMark, PField/PButton/PTabBar/KitToast in cells).
- Tasks 4–13 all touch `cells.json` + both registries → tasks are SEQUENTIAL (no parallel dispatch).
- The proto gallery never loads `proto.jsx` (it self-mounts); proto.jsx-local primitives are verbatim-copied into `proto-cells.jsx` with line markers.
- Naming: `KitToast` avoids colliding with the legacy toast component until Phase 4 cleanup renames it.
- `parity.html` is dev-only: vite build's single input is index.html, so it never ships.
- Advisory mechanism exists solely for `lattice-verdict` — a legitimate expected-unknown, not a silent cap.
