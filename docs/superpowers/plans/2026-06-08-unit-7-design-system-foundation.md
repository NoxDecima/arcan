# Unit 7 — Design system foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the Nox Noir design-system foundation that every other UI-rework unit consumes: tokens, self-hosted fonts, theme + accent system persisted on `me.root.settings`, Lattice logo component, toast + skeleton primitives, restyled component library, cross-route token audit, drift prevention.

**Architecture:** Tokens live in `src/styles/tokens.css` as CSS custom properties keyed off a `data-theme` attribute on `<html>`. Tailwind config maps utilities (`bg-panel`, `text-text`, `font-mono`) to the tokens so existing components transition by class rename. Theme + accent persist on `me.root.settings.appearance.*` via a thin Jazz-backed provider. Toast + skeleton are pure React primitives consuming tokens. Existing `notificationPrefs` is replaced outright by `settings.notifications` per the destructive baseline.

**Tech Stack:** TypeScript strict, React 18, Tailwind v3 + shadcn-style primitives, jazz-tools 0.20.18, Vitest + Playwright. Fonts via `@fontsource/inter` + `@fontsource/jetbrains-mono` (self-hosted woff2, bundled at build).

**Spec:** `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md` — Unit 7 (and the Unit 5 `#0a0b11` color touch folded in here).

---

## Phase structure

| Phase | Purpose |
|---|---|
| 0 | Setup + brief inventory |
| 1 | Schema: replace `me.root.notificationPrefs` with nested `me.root.settings` (TDD) |
| 2 | Tokens CSS + self-hosted fonts + Tailwind config wiring |
| 3 | Theme provider + hook (system default → persisted on `settings.appearance.theme`) |
| 4 | Accent provider + hook (6 colors, persisted on `settings.appearance.accent`) |
| 5 | Lattice logo component (4 tiers) |
| 6 | Toast system (provider + hook + component) |
| 7 | Skeleton primitives |
| 8 | Settings → Appearance card (theme toggle + accent picker, interaction tests) |
| 9 | Migrate notification-manager + sidebar + notifications-section reads/writes |
| 10 | Component library restyle (`button.tsx` and 17 top-level components in `src/components/`) |
| 11 | Cross-route token audit pass (auth, onboarding, pair, invite, App shell) |
| 12 | Drift prevention (ESLint rule) + CLAUDE.md "Visual conventions" |
| 13 | Unit 5 touch: `#0a0a0a` → `#0a0b11` in manifest + index.html meta |
| 14 | Final verification (full build + test + visual smoke) |

---

## Phase 0 · Setup

### Task 0.1: Confirm branch + clean working tree

- [ ] **Step 1: Make sure you're on a clean branch and `main` is the base**

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git status --short
git log --oneline -3
```

Expected: clean working tree; HEAD at the latest commit (the spec revision `c6e5c4e` or later).

- [ ] **Step 2: Create a dedicated branch**

```bash
git checkout -b unit-7-design-system-foundation
```

- [ ] **Step 3: Pre-install dependencies (so later phases don't hit cold caches)**

```bash
npm install
cd api && npm install && cd ..
```

Expected: no errors, fast install (lockfiles current).

---

## Phase 1 · Schema: `me.root.settings`

### Task 1.1: Write failing test for the new `settings` schema

**Files:**
- Create: `tests/unit/jazz/schema/arcan-account-settings.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/unit/jazz/schema/arcan-account-settings.test.ts
import { describe, test, expect } from "vitest";
import { ArcanAccountRoot } from "@/jazz/schema/ArcanAccount";

describe("ArcanAccountRoot settings schema", () => {
  test("root has a `settings` field with nested appearance + notifications", () => {
    // Inspect schema descriptors — both the field and its nested sub-fields
    // should be defined.
    const def = (ArcanAccountRoot as unknown as { def: { shape: Record<string, unknown> } }).def;
    expect(def.shape).toBeDefined();
    expect(def.shape.settings).toBeDefined();
  });

  test("root no longer has the old `notificationPrefs` field", () => {
    const def = (ArcanAccountRoot as unknown as { def: { shape: Record<string, unknown> } }).def;
    expect(def.shape.notificationPrefs).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
npx vitest run tests/unit/jazz/schema/arcan-account-settings.test.ts
```

Expected: FAIL — `settings` not yet on root; `notificationPrefs` still present.

### Task 1.2: Update the `ArcanAccount` schema

**Files:**
- Modify: `src/jazz/schema/ArcanAccount.ts`

- [ ] **Step 1: Inspect the current shape**

```bash
sed -n '1,80p' src/jazz/schema/ArcanAccount.ts
```

You'll see imports + `ArcanAccountRoot = co.map({ ... contactBook, knownConversations, lastReadAt, notificationPrefs, devices ... })`.

- [ ] **Step 2: Replace the `notificationPrefs` field with the nested `settings` map**

Find this block (around line 49):

```typescript
  notificationPrefs: co
    .map({
      sound: z.boolean(),
      browser: z.boolean(),
    }),
```

Replace with:

```typescript
  settings: co.map({
    appearance: co.map({
      theme: z.enum(["light", "dark"]),
      accent: z.enum(["tokyo", "violet", "teal", "lime", "amber", "rose"]),
    }),
    notifications: co.map({
      sound: z.boolean(),
      browser: z.boolean(),
    }),
  }),
```

- [ ] **Step 3: Update the account-creation migration to initialise `settings`**

Find the block that creates `notificationPrefs` during account creation (around line 110, inside the `withMigration` callback's root-init branch):

```typescript
    const notificationPrefs = co
      .map({ sound: z.boolean(), browser: z.boolean() })
      .create({ sound: false, browser: false }, { owner: me });
```

Replace with:

```typescript
    const settings = co
      .map({
        appearance: co.map({
          theme: z.enum(["light", "dark"]),
          accent: z.enum(["tokyo", "violet", "teal", "lime", "amber", "rose"]),
        }),
        notifications: co.map({ sound: z.boolean(), browser: z.boolean() }),
      })
      .create(
        {
          appearance: co
            .map({
              theme: z.enum(["light", "dark"]),
              accent: z.enum(["tokyo", "violet", "teal", "lime", "amber", "rose"]),
            })
            .create({ theme: "dark", accent: "tokyo" }, { owner: me }),
          notifications: co
            .map({ sound: z.boolean(), browser: z.boolean() })
            .create({ sound: false, browser: false }, { owner: me }),
        },
        { owner: me },
      );
```

Then in the `JazzMessangerAccountRoot.create({ ... })` call below it, replace `notificationPrefs,` with `settings,`.

- [ ] **Step 4: Update the existing-accounts backfill block**

Find the `notificationPrefs` backfill block (around line 193). Replace the whole block with a `settings` backfill that creates the nested structure with the same defaults:

```typescript
  // -- 2c. settings backfill (existing accounts) --
  // Per the destructive baseline this is a clean rebuild; backfill still runs
  // defensively so any in-flight dev accounts pick up the new shape.
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).settings
  ) {
    const settings = co
      .map({
        appearance: co.map({
          theme: z.enum(["light", "dark"]),
          accent: z.enum(["tokyo", "violet", "teal", "lime", "amber", "rose"]),
        }),
        notifications: co.map({ sound: z.boolean(), browser: z.boolean() }),
      })
      .create(
        {
          appearance: co
            .map({
              theme: z.enum(["light", "dark"]),
              accent: z.enum(["tokyo", "violet", "teal", "lime", "amber", "rose"]),
            })
            .create({ theme: "dark", accent: "tokyo" }, { owner: me }),
          notifications: co
            .map({ sound: z.boolean(), browser: z.boolean() })
            .create({ sound: false, browser: false }, { owner: me }),
        },
        { owner: me },
      );
    (me.root as any).$jazz.set("settings", settings);
  }
```

- [ ] **Step 5: Re-run the test**

```bash
npx vitest run tests/unit/jazz/schema/arcan-account-settings.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the full unit suite to catch importer drift**

```bash
timeout 90 npm run test 2>&1 | tail -20
```

Expected: any tests that read `notificationPrefs` will fail. We update them in Phase 9. For now, **note them in the commit message** but don't fix yet — Phase 9 will clean up the consumer side intentionally.

If too many tests fail to commit, skip ahead to Task 9.1 first to fix consumers before re-running tests.

### Task 1.3: Commit Phase 1

- [ ] **Step 1: Commit**

```bash
git add src/jazz/schema/ArcanAccount.ts tests/unit/jazz/schema/arcan-account-settings.test.ts
git commit -m "refactor(schema): replace notificationPrefs with nested me.root.settings

Adds settings.appearance (theme, accent) and settings.notifications
(sound, browser). Drops the flat notificationPrefs map outright per the
destructive baseline. Consumers updated in Phase 9.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2 · Tokens CSS + self-hosted fonts + Tailwind wiring

### Task 2.1: Install self-hosted font packages

**Files:**
- Modify: `package.json` (auto-updated by npm install)

- [ ] **Step 1: Install fontsource packages**

```bash
npm install @fontsource/inter @fontsource/jetbrains-mono
```

Expected: `@fontsource/inter` and `@fontsource/jetbrains-mono` added to dependencies. Includes all weights as separate CSS imports.

### Task 2.2: Create `src/styles/tokens.css`

**Files:**
- Create: `src/styles/tokens.css`

- [ ] **Step 1: Write the full tokens file**

```css
/* =========================================================
   Arcan design tokens — palette, typography, spacing, motion.
   Default theme is dark. Light theme is opt-in via
   <html data-theme="light">. Accent is layered on top via
   <html data-accent="tokyo|violet|teal|lime|amber|rose">.
   ========================================================= */

/* ---------- Default (dark) palette + neutral tokens ---------- */
:root {
  /* Palette */
  --color-bg: #0b0d14;
  --color-bg-stage: #06070d;
  --color-panel: #12141f;
  --color-panel-2: #1a1d2e;
  --color-rail: #0e1019;
  --color-border: #232639;
  --color-text: #c8d1f0;
  --color-text-2: #8a93b2;
  --color-dim: #5a6380;
  --color-faint: #3a4060;

  /* Semantic */
  --color-green: #9ece6a;
  --color-amber: #e0af68;
  --color-red:   #f7768e;
  --color-teal:  #73daca;

  /* Typography */
  --font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --font-display: 'JetBrains Mono', ui-monospace, monospace;

  --fs-hero: clamp(48px, 7vw, 96px);
  --fs-display: clamp(36px, 5vw, 64px);
  --fs-h1: 40px;
  --fs-h2: 28px;
  --fs-h3: 20px;
  --fs-body: 15px;
  --fs-body-lg: 17px;
  --fs-small: 13px;
  --fs-meta: 11px;
  --fs-micro: 10px;

  --lh-tight: 1.05;
  --lh-snug: 1.15;
  --lh-body: 1.6;
  --lh-loose: 1.75;

  --tracking-display: -0.02em;
  --tracking-title: -0.01em;
  --tracking-caps: 0.18em;
  --tracking-caps-lg: 0.24em;

  /* Spacing (8pt base, plus micro) */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;
  --sp-7: 48px;
  --sp-8: 64px;
  --sp-9: 96px;
  --sp-10: 128px;

  /* Radii */
  --r-0: 0px;
  --r-1: 2px;
  --r-2: 4px;
  --r-3: 6px;
  --r-pill: 999px;

  /* Borders */
  --bw-hair: 1px;
  --bw-thick: 2px;

  /* Shadows */
  --shadow-1: 0 1px 0 rgba(255,255,255,0.02) inset, 0 1px 2px rgba(0,0,0,0.4);
  --shadow-2: 0 4px 16px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.02) inset;
  --shadow-glow-accent: 0 0 10px rgba(122,162,247,0.55);

  /* Motion */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-in:  cubic-bezier(0.4, 0, 1, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 360ms;

  /* Layout */
  --content-narrow: 640px;
  --content: 860px;
  --content-wide: 1120px;
  --content-max: 1280px;

  /* Default accent fallback (tokyo) — overridden by [data-accent] selectors below */
  --color-accent: #7aa2f7;
  --color-accent-grad-0: #7aa2f7;
  --color-accent-grad-1: #bb9af7;
  --color-accent-soft: rgba(122, 162, 247, 0.16);
  --color-accent-border: rgba(122, 162, 247, 0.5);
  --color-on-accent: #ffffff;
}

/* ---------- Light theme overrides (data-theme="light") ---------- */
:root[data-theme="light"] {
  --color-bg: #f5f6f9;
  --color-bg-stage: #e3e5ec;
  --color-panel: #ffffff;
  --color-panel-2: #edeff4;
  --color-rail: #eef0f5;
  --color-border: #e3e6ed;
  --color-text: #0d1018;
  --color-text-2: #3c425a;
  --color-dim: #727892;
  --color-faint: #b9bdcc;

  --color-green: #4f8a36;
  --color-amber: #b5832b;
  --color-red: #d6455d;
  --color-teal: #2f9d8c;

  --shadow-1: 0 1px 0 rgba(255,255,255,0.5) inset, 0 1px 2px rgba(40,40,60,0.08);
  --shadow-2: 0 4px 16px rgba(40,40,60,0.16), 0 1px 0 rgba(255,255,255,0.6) inset;

  --color-accent-soft: rgba(122, 162, 247, 0.12);
  --color-accent-border: rgba(122, 162, 247, 0.4);
}

/* ---------- Accent palettes (data-accent="<name>") ---------- */
/* Each accent overrides --color-accent* tokens. Soft + border alpha are
   theme-aware via the rules above. */

:root[data-accent="tokyo"]  { --color-accent: #7aa2f7; --color-accent-grad-0: #7aa2f7; --color-accent-grad-1: #bb9af7; }
:root[data-accent="violet"] { --color-accent: #bb9af7; --color-accent-grad-0: #bb9af7; --color-accent-grad-1: #7aa2f7; }
:root[data-accent="teal"]   { --color-accent: #73daca; --color-accent-grad-0: #73daca; --color-accent-grad-1: #7dcfff; }
:root[data-accent="lime"]   { --color-accent: #9ece6a; --color-accent-grad-0: #9ece6a; --color-accent-grad-1: #73daca; }
:root[data-accent="amber"]  { --color-accent: #e0af68; --color-accent-grad-0: #e0af68; --color-accent-grad-1: #f7768e; }
:root[data-accent="rose"]   { --color-accent: #f7768e; --color-accent-grad-0: #f7768e; --color-accent-grad-1: #bb9af7; }

/* On light theme, fills get a small darkening for text contrast */
:root[data-theme="light"][data-accent="tokyo"]  { --color-on-accent: #ffffff; }
:root[data-theme="light"][data-accent="violet"] { --color-on-accent: #ffffff; }
:root[data-theme="light"][data-accent="teal"]   { --color-on-accent: #0b0d14; }
:root[data-theme="light"][data-accent="lime"]   { --color-on-accent: #0b0d14; }
:root[data-theme="light"][data-accent="amber"]  { --color-on-accent: #0b0d14; }
:root[data-theme="light"][data-accent="rose"]   { --color-on-accent: #ffffff; }

:root[data-theme="dark"][data-accent="tokyo"],
:root[data-theme="dark"][data-accent="violet"],
:root[data-theme="dark"][data-accent="rose"] { --color-on-accent: #ffffff; }

:root[data-theme="dark"][data-accent="teal"],
:root[data-theme="dark"][data-accent="lime"],
:root[data-theme="dark"][data-accent="amber"] { --color-on-accent: #0b0d14; }

/* ---------- Base body styles ---------- */
html, body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

### Task 2.3: Wire up tokens and fonts via `src/main.tsx`

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Inspect current main.tsx**

```bash
cat src/main.tsx
```

You'll see existing imports (React, ReactDOM, App, index.css).

- [ ] **Step 2: Add font + token imports**

At the top of `src/main.tsx`, after the existing imports, add:

```typescript
// Self-hosted fonts (woff2 from @fontsource)
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";

// Design tokens
import "@/styles/tokens.css";
```

### Task 2.4: Update Tailwind config to map utilities to tokens

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Inspect current Tailwind config**

```bash
cat tailwind.config.ts
```

Note the existing `theme.extend` block.

- [ ] **Step 2: Extend `theme.extend.colors`, `fontFamily`, `borderRadius`, `boxShadow`**

In `theme.extend`, add (or merge with existing):

```typescript
extend: {
  colors: {
    // Surface tokens
    bg: 'var(--color-bg)',
    'bg-stage': 'var(--color-bg-stage)',
    panel: 'var(--color-panel)',
    'panel-2': 'var(--color-panel-2)',
    rail: 'var(--color-rail)',
    hairline: 'var(--color-border)',

    // Text tokens
    text: 'var(--color-text)',
    'text-2': 'var(--color-text-2)',
    dim: 'var(--color-dim)',
    faint: 'var(--color-faint)',

    // Semantic
    green: 'var(--color-green)',
    amber: 'var(--color-amber)',
    red: 'var(--color-red)',
    teal: 'var(--color-teal)',

    // Accent
    accent: 'var(--color-accent)',
    'accent-soft': 'var(--color-accent-soft)',
    'accent-border': 'var(--color-accent-border)',
    'on-accent': 'var(--color-on-accent)',
  },
  fontFamily: {
    body: ['var(--font-body)'],
    mono: ['var(--font-mono)'],
    display: ['var(--font-display)'],
  },
  borderRadius: {
    'r-0': '0px',
    'r-1': 'var(--r-1)',
    'r-2': 'var(--r-2)',
    'r-3': 'var(--r-3)',
    pill: 'var(--r-pill)',
  },
  boxShadow: {
    'level-1': 'var(--shadow-1)',
    'level-2': 'var(--shadow-2)',
  },
},
```

If `theme.extend.colors` already has values, **merge** rather than overwrite (preserve existing keys).

- [ ] **Step 3: Set the default `<html>` attributes**

In `index.html`, add `data-theme="dark"` and `data-accent="tokyo"` to the `<html>` tag (so the page renders the right tokens before React hydrates):

Find:
```html
<html lang="en">
```

Replace with:
```html
<html lang="en" data-theme="dark" data-accent="tokyo">
```

### Task 2.5: Sanity test that tokens resolve

**Files:**
- Create: `tests/unit/styles/tokens.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/unit/styles/tokens.test.ts
import { describe, test, expect, beforeEach } from "vitest";

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
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run tests/unit/styles/tokens.test.ts
```

Expected: PASS.

### Task 2.6: Commit Phase 2

- [ ] **Step 1: Commit**

```bash
git add package.json package-lock.json src/styles/tokens.css src/main.tsx tailwind.config.ts index.html tests/unit/styles/tokens.test.ts
git commit -m "feat(styles): add tokens.css + self-hosted fonts + Tailwind wiring

Adds src/styles/tokens.css with palette/typography/spacing/radii/motion
tokens for dark (default) and light themes plus six accents (tokyo,
violet, teal, lime, amber, rose). Self-hosts Inter + JetBrains Mono via
@fontsource (woff2 latin subset, weights 300-700 / 400-700). Wires
Tailwind utility classes (bg-panel, text-text, font-mono, etc.) to the
tokens so existing components can transition by class rename. index.html
gets the default data-theme + data-accent attributes for first-paint
correctness.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3 · Theme provider + hook

### Task 3.1: Write failing tests for the theme hook

**Files:**
- Create: `tests/unit/styles/use-theme.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/unit/styles/use-theme.test.ts
import { describe, test, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme, ThemeProvider } from "@/styles/use-theme";

describe("useTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "dark");
  });

  test("returns the current theme from document attribute", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });
    expect(result.current.theme).toBe("dark");
  });

  test("setTheme updates the document attribute and the returned value", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });
    act(() => result.current.setTheme("light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(result.current.theme).toBe("light");
  });
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
npx vitest run tests/unit/styles/use-theme.test.ts
```

Expected: FAIL — module not found.

### Task 3.2: Implement the theme provider + hook

**Files:**
- Create: `src/styles/use-theme.tsx`

- [ ] **Step 1: Write the implementation**

```tsx
// src/styles/use-theme.tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  // Fallback to system preference
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  // Sync document attribute when theme changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
```

- [ ] **Step 2: Re-run the tests**

```bash
npx vitest run tests/unit/styles/use-theme.test.ts
```

Expected: PASS.

### Task 3.3: Wire ThemeProvider into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Wrap the existing tree in `<ThemeProvider>`**

At the top of `src/App.tsx`, add:

```typescript
import { ThemeProvider } from "@/styles/use-theme";
```

Find the root JSX returned by `App` (or by the route layout). Wrap everything in `<ThemeProvider>`. For example, if the layout currently returns `<div ...>...</div>`, wrap as:

```tsx
return (
  <ThemeProvider>
    <div ...>...</div>
  </ThemeProvider>
);
```

If there are multiple top-level returns (auth vs. authenticated branches), wrap each at the outermost layer.

- [ ] **Step 2: Run the full test suite to make sure nothing breaks**

```bash
timeout 90 npm run test 2>&1 | tail -10
```

Expected: PASS (excluding the consumer-side failures from Phase 1 which we fix in Phase 9).

### Task 3.4: Commit Phase 3

- [ ] **Step 1: Commit**

```bash
git add src/styles/use-theme.tsx src/App.tsx tests/unit/styles/use-theme.test.ts
git commit -m "feat(styles): add ThemeProvider + useTheme hook

Theme is read from document.documentElement.data-theme on mount; falls
back to system preference if absent. setTheme writes both React state
and the document attribute so token CSS resolves immediately. Wired
into App at the root so all descendants can call useTheme.

Settings persistence (writing back to me.root.settings.appearance.theme)
is in Phase 8 (Settings card).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4 · Accent provider + hook

### Task 4.1: Write failing tests for the accent hook

**Files:**
- Create: `tests/unit/styles/use-accent.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/unit/styles/use-accent.test.ts
import { describe, test, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAccent, AccentProvider, ACCENT_KEYS } from "@/styles/use-accent";

describe("useAccent", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.setAttribute("data-accent", "tokyo");
  });

  test("ACCENT_KEYS exposes all six accents", () => {
    expect(ACCENT_KEYS).toEqual(["tokyo", "violet", "teal", "lime", "amber", "rose"]);
  });

  test("returns current accent from document attribute", () => {
    const { result } = renderHook(() => useAccent(), { wrapper: AccentProvider });
    expect(result.current.accent).toBe("tokyo");
  });

  test("setAccent updates the document attribute and the value", () => {
    const { result } = renderHook(() => useAccent(), { wrapper: AccentProvider });
    act(() => result.current.setAccent("violet"));
    expect(document.documentElement.getAttribute("data-accent")).toBe("violet");
    expect(result.current.accent).toBe("violet");
  });

  test("rejects unknown accent values at runtime", () => {
    const { result } = renderHook(() => useAccent(), { wrapper: AccentProvider });
    // @ts-expect-error — intentionally invalid value to test runtime guard
    expect(() => result.current.setAccent("blurple")).toThrow(/unknown accent/i);
  });
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
npx vitest run tests/unit/styles/use-accent.test.ts
```

Expected: FAIL — module not found.

### Task 4.2: Implement the accent provider + hook

**Files:**
- Create: `src/styles/use-accent.tsx`

- [ ] **Step 1: Write the implementation**

```tsx
// src/styles/use-accent.tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export const ACCENT_KEYS = ["tokyo", "violet", "teal", "lime", "amber", "rose"] as const;
export type Accent = (typeof ACCENT_KEYS)[number];

interface AccentContextValue {
  accent: Accent;
  setAccent: (a: Accent) => void;
}

const AccentContext = createContext<AccentContextValue | null>(null);

function readInitialAccent(): Accent {
  if (typeof document === "undefined") return "tokyo";
  const attr = document.documentElement.getAttribute("data-accent");
  return ACCENT_KEYS.includes(attr as Accent) ? (attr as Accent) : "tokyo";
}

export function AccentProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<Accent>(readInitialAccent);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  const setAccent = useCallback((a: Accent) => {
    if (!ACCENT_KEYS.includes(a)) {
      throw new Error(`unknown accent: ${a}`);
    }
    setAccentState(a);
  }, []);

  return <AccentContext.Provider value={{ accent, setAccent }}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
  const ctx = useContext(AccentContext);
  if (!ctx) {
    throw new Error("useAccent must be used inside <AccentProvider>");
  }
  return ctx;
}
```

- [ ] **Step 2: Re-run the tests**

```bash
npx vitest run tests/unit/styles/use-accent.test.ts
```

Expected: PASS.

### Task 4.3: Wire AccentProvider into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Wrap inside ThemeProvider**

```tsx
import { ThemeProvider } from "@/styles/use-theme";
import { AccentProvider } from "@/styles/use-accent";

// In the root render:
<ThemeProvider>
  <AccentProvider>
    {/* existing tree */}
  </AccentProvider>
</ThemeProvider>
```

### Task 4.4: Commit Phase 4

- [ ] **Step 1: Commit**

```bash
git add src/styles/use-accent.tsx src/App.tsx tests/unit/styles/use-accent.test.ts
git commit -m "feat(styles): add AccentProvider + useAccent hook

Six accents (tokyo, violet, teal, lime, amber, rose) bound to
document.documentElement.data-accent. setAccent validates against
ACCENT_KEYS at runtime and writes both React state and the DOM
attribute so token CSS resolves immediately.

Settings persistence (writing back to me.root.settings.appearance.accent)
is in Phase 8.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 5 · Lattice logo component

### Task 5.1: Write failing tests for the Lattice tier selector

**Files:**
- Create: `tests/unit/components/lattice.test.tsx`

- [ ] **Step 1: Write the test**

```typescript
// tests/unit/components/lattice.test.tsx
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
```

- [ ] **Step 2: Run and confirm fail**

```bash
npx vitest run tests/unit/components/lattice.test.tsx
```

Expected: FAIL — module not found.

### Task 5.2: Implement the Lattice component

**Files:**
- Create: `src/components/lattice.tsx`

- [ ] **Step 1: Write the implementation**

```tsx
// src/components/lattice.tsx
import { useId } from "react";

export type LatticeTier = "full" | "reduced" | "minimal" | "glyph";

export function latticeTier(size: number): LatticeTier {
  if (size >= 44) return "full";
  if (size >= 26) return "reduced";
  if (size >= 18) return "minimal";
  return "glyph";
}

/* ---- low-level SVG primitives ---- */

function pc(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
}
const f = (n: number) => n.toFixed(2);

function ring(r: number, sw: number, p: string): string {
  return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${p}" stroke-width="${sw}" />`;
}

function ticks(r: number, count: number, len: number, sw: number, p: string): string {
  let s = "";
  for (let i = 0; i < count; i++) {
    const deg = (i * 360) / count;
    const [x1, y1] = pc(r, deg);
    const [x2, y2] = pc(r - len, deg);
    s += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${p}" stroke-width="${sw}" stroke-linecap="butt" />`;
  }
  return s;
}

function hexPoly(R: number, fillP: string | null, strokeP: string | null, sw = 2): string {
  const pts = [0, 60, 120, 180, 240, 300].map((d) => pc(R, d).map(f).join(",")).join(" ");
  const stroke = strokeP ? `stroke="${strokeP}" stroke-width="${sw}" stroke-linejoin="miter"` : "";
  return `<polygon points="${pts}" fill="${fillP || "none"}" ${stroke} />`;
}

function spokes6(r1: number, r2: number, sw: number, p: string): string {
  let s = "";
  for (let k = 0; k < 6; k++) {
    const [x1, y1] = pc(r1, k * 60);
    const [x2, y2] = pc(r2, k * 60);
    s += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${p}" stroke-width="${sw}" stroke-linecap="round" />`;
  }
  return s;
}

function tierMarkup(tier: LatticeTier, p: string): string {
  switch (tier) {
    case "full":
      return (
        ring(42, 2.6, p) +
        ticks(42, 24, 5, 1.4, p) +
        spokes6(17, 42, 1.8, p) +
        ring(30, 1.3, p) +
        hexPoly(17, null, p, 2.4) +
        hexPoly(8.5, p, null)
      );
    case "reduced":
      return ring(42, 3, p) + spokes6(18, 42, 2.8, p) + ring(30, 1.6, p) + hexPoly(18, null, p, 3) + hexPoly(9, p, null);
    case "minimal":
      return ring(42, 3.4, p) + spokes6(19, 42, 3, p) + hexPoly(19, null, p, 3.4) + hexPoly(9, p, null);
    case "glyph":
      return ring(42, 5, p) + spokes6(14, 42, 4.5, p) + hexPoly(20, p, null);
  }
}

/* ---- component ---- */

export interface LatticeProps {
  size?: number;
  mono?: boolean;
  className?: string;
}

export function Lattice({ size = 24, mono = false, className }: LatticeProps) {
  const tier = latticeTier(size);
  const uid = useId().replace(/:/g, "");
  const paint = mono ? "currentColor" : `url(#lattice-grad-${uid})`;
  const inner = tierMarkup(tier, paint);

  const grad = mono
    ? ""
    : `<defs><linearGradient id="lattice-grad-${uid}" gradientUnits="userSpaceOnUse" x1="14" y1="86" x2="86" y2="14">` +
      `<stop offset="0" stop-color="var(--color-accent-grad-0)"/>` +
      `<stop offset="1" stop-color="var(--color-accent-grad-1)"/>` +
      `</linearGradient></defs>`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Arcan"
      className={className}
      style={{ display: "block", flexShrink: 0, overflow: "visible" }}
      dangerouslySetInnerHTML={{ __html: grad + inner }}
    />
  );
}
```

- [ ] **Step 2: Re-run the tests**

```bash
npx vitest run tests/unit/components/lattice.test.tsx
```

Expected: PASS — 7 tests.

### Task 5.3: Commit Phase 5

- [ ] **Step 1: Commit**

```bash
git add src/components/lattice.tsx tests/unit/components/lattice.test.tsx
git commit -m "feat(components): add Lattice logo component (4 tiers)

Pure React port of the design's lattice.js geometry. latticeTier(size)
picks the right detail level (full >= 44, reduced 26-43, minimal 18-25,
glyph < 18). Accent-aware via a linear gradient bound to the accent
tokens; mono prop uses currentColor for icon-button contexts.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 6 · Toast system

### Task 6.1: Write failing tests for the toast provider + hook

**Files:**
- Create: `tests/unit/components/toast.test.tsx`

- [ ] **Step 1: Write the test**

```typescript
// tests/unit/components/toast.test.tsx
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, act, renderHook } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/toast";
import type { ReactNode } from "react";

function Wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test("toast() renders a toast then dismisses after the default 2200ms", () => {
    const { result } = renderHook(() => useToast(), { wrapper: Wrapper });
    act(() => result.current({ icon: "copy", text: "invite link copied", tone: "accent" }));
    expect(screen.getByText("invite link copied")).toBeTruthy();
    act(() => vi.advanceTimersByTime(2300));
    expect(screen.queryByText("invite link copied")).toBeNull();
  });

  test("variant tone gets applied as a data attribute", () => {
    const { result } = renderHook(() => useToast(), { wrapper: Wrapper });
    act(() => result.current({ icon: "bell", text: "settings saved", tone: "success" }));
    const el = screen.getByText("settings saved").closest("[data-toast-tone]");
    expect(el?.getAttribute("data-toast-tone")).toBe("success");
  });
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
npx vitest run tests/unit/components/toast.test.tsx
```

Expected: FAIL.

### Task 6.2: Implement the toast provider + component + hook

**Files:**
- Create: `src/components/toast.tsx`

- [ ] **Step 1: Write the implementation**

```tsx
// src/components/toast.tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ToastTone = "neutral" | "success" | "accent" | "error";

export interface ToastOptions {
  text: string;
  icon?: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

type ToastFn = (opts: ToastOptions) => void;

const ToastContext = createContext<ToastFn | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback((opts: ToastOptions) => {
    const id = ++counter.current;
    const durationMs = opts.durationMs ?? 2200;
    setItems((cur) => [...cur, { ...opts, id }]);
    const timer = setTimeout(() => {
      setItems((cur) => cur.filter((t) => t.id !== id));
    }, durationMs);
    // Cleanup on unmount safety (best-effort)
    return () => clearTimeout(timer);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastViewport items={items} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ items }: { items: ToastItem[] }) {
  if (items.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "var(--sp-4)",
        right: "var(--sp-4)",
        bottom: "var(--sp-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-2)",
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      {items.map((t) => (
        <Toast key={t.id} item={t} />
      ))}
    </div>
  );
}

function Toast({ item }: { item: ToastItem }) {
  const tone = item.tone ?? "neutral";
  return (
    <div
      data-toast-tone={tone}
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-3)",
        padding: "11px 14px",
        borderRadius: "var(--r-3)",
        background: "var(--color-panel)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text)",
        font: `500 12px/1.3 var(--font-body)`,
        boxShadow: "var(--shadow-2)",
        animation: "arcan-toast-in 250ms var(--ease-out) both",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: toneBg(tone),
          color: toneFg(tone),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 13,
        }}
      >
        {/* Plain dot — full icon set comes later when we have the IPATHS lib */}
        ●
      </span>
      <span>{item.text}</span>
    </div>
  );
}

function toneBg(t: ToastTone): string {
  switch (t) {
    case "success": return "rgba(158, 206, 106, 0.18)";
    case "accent":  return "var(--color-accent-soft)";
    case "error":   return "rgba(247, 118, 142, 0.18)";
    default:        return "rgba(138, 147, 178, 0.18)";
  }
}
function toneFg(t: ToastTone): string {
  switch (t) {
    case "success": return "var(--color-green)";
    case "accent":  return "var(--color-accent)";
    case "error":   return "var(--color-red)";
    default:        return "var(--color-text-2)";
  }
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
```

- [ ] **Step 2: Add the toast keyframe to tokens.css**

In `src/styles/tokens.css`, after the base body styles at the bottom, append:

```css
@keyframes arcan-toast-in {
  from { transform: translateY(10px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
```

- [ ] **Step 3: Re-run the tests**

```bash
npx vitest run tests/unit/components/toast.test.tsx
```

Expected: PASS.

### Task 6.3: Wire ToastProvider into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Wrap inside AccentProvider**

```tsx
import { ToastProvider } from "@/components/toast";

<ThemeProvider>
  <AccentProvider>
    <ToastProvider>
      {/* existing tree */}
    </ToastProvider>
  </AccentProvider>
</ThemeProvider>
```

### Task 6.4: Commit Phase 6

- [ ] **Step 1: Commit**

```bash
git add src/components/toast.tsx src/styles/tokens.css src/App.tsx tests/unit/components/toast.test.tsx
git commit -m "feat(components): add Toast provider + useToast hook

Single-purpose toast queue: useToast() returns a fire-and-forget toast()
fn. Variants neutral/success/accent/error map to icon-bg + icon-fg colors
from accent and semantic tokens. Default 2200ms auto-dismiss. Slide-in
animation via the new arcan-toast-in keyframe.

Wired into App via ToastProvider so any descendant can call useToast().

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 7 · Skeleton primitives

### Task 7.1: Create the skeleton primitive

**Files:**
- Create: `src/components/skeleton.tsx`

- [ ] **Step 1: Write the primitive + composed skeletons**

```tsx
// src/components/skeleton.tsx
import type { CSSProperties } from "react";

export interface SkelProps {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  style?: CSSProperties;
  className?: string;
}

/** Generic shimmer rectangle. */
export function Skel({ w = "100%", h = 12, r = 4, style, className }: SkelProps) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: "block",
        width: w,
        height: h,
        borderRadius: r,
        background:
          "linear-gradient(90deg, var(--color-panel-2) 0%, var(--color-panel) 50%, var(--color-panel-2) 100%)",
        backgroundSize: "200% 100%",
        animation: "arcan-shimmer 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function NavListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", padding: "var(--sp-2) var(--sp-2)" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", padding: "var(--sp-2) var(--sp-3)" }}>
          <Skel w={36} h={36} r={18} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <Skel w="60%" h={12} />
            <Skel w="40%" h={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatHeaderSkeleton() {
  return (
    <div
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-3)",
        padding: "0 var(--sp-4)",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-bg)",
      }}
    >
      <Skel w={34} h={34} r={17} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <Skel w={120} h={12} />
        <Skel w={60} h={9} />
      </div>
    </div>
  );
}

export function ChatMessagesSkeleton() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--sp-3)", padding: "var(--sp-4)", background: "var(--color-bg)" }}>
      {/* alternating align */}
      {[0, 1, 2, 3, 4].map((i) => {
        const mine = i % 2 === 1;
        const widths = [160, 100, 200, 130, 180];
        return (
          <div key={i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
            <Skel w={widths[i]} h={32} r={14} />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add the shimmer keyframe to tokens.css**

In `src/styles/tokens.css`, after the toast keyframe, append:

```css
@keyframes arcan-shimmer {
  0%   { background-position: 0% 0; }
  100% { background-position: -200% 0; }
}
```

### Task 7.2: Write a render smoke test

**Files:**
- Create: `tests/unit/components/skeleton.test.tsx`

- [ ] **Step 1: Write the test**

```typescript
// tests/unit/components/skeleton.test.tsx
import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skel, NavListSkeleton, ChatHeaderSkeleton, ChatMessagesSkeleton } from "@/components/skeleton";

describe("Skeleton primitives", () => {
  test("Skel renders an aria-hidden span with the requested size", () => {
    const { container } = render(<Skel w={120} h={20} r={6} />);
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.getAttribute("aria-hidden")).toBe("true");
    expect(span?.style.width).toBe("120px");
    expect(span?.style.height).toBe("20px");
  });
  test("NavListSkeleton renders the requested number of rows", () => {
    const { container } = render(<NavListSkeleton rows={4} />);
    expect(container.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThanOrEqual(4 * 3);
  });
  test("ChatHeaderSkeleton + ChatMessagesSkeleton render without errors", () => {
    expect(() => render(<ChatHeaderSkeleton />)).not.toThrow();
    expect(() => render(<ChatMessagesSkeleton />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/unit/components/skeleton.test.tsx
```

Expected: PASS.

### Task 7.3: Commit Phase 7

- [ ] **Step 1: Commit**

```bash
git add src/components/skeleton.tsx src/styles/tokens.css tests/unit/components/skeleton.test.tsx
git commit -m "feat(components): add Skel primitive + composed skeleton helpers

Generic <Skel w h r /> with a shimmer animation, plus NavListSkeleton,
ChatHeaderSkeleton, ChatMessagesSkeleton for the most-loaded surfaces.
All consume tokens; replaces 'Loading…' text fallbacks in later phases.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 8 · Settings → Appearance card + Jazz persistence

### Task 8.1: Migrate `notification-manager.tsx` to read from `settings.notifications`

This must happen first so Phase 8's Settings card can persist appearance without breaking the
unrelated notification reads.

**Files:**
- Modify: `src/App.tsx` (the `useAccount` resolve query that mentions `notificationPrefs`)
- Modify: `src/components/notification-manager.tsx`

- [ ] **Step 1: Update App.tsx resolve query**

Find the `resolve: { ... }` block that currently mentions `notificationPrefs: true`. Replace
`notificationPrefs: true` with `settings: { notifications: true }`.

- [ ] **Step 2: Update notification-manager.tsx**

Find the resolve query around line 48 and the reads (`me.root.notificationPrefs.sound`,
`me.root.notificationPrefs.browser`).

Replace `notificationPrefs: true` in the resolve with `settings: { notifications: true }`.

Replace all `me.root.notificationPrefs.X` → `me.root.settings.notifications.X` (sound + browser).

Update any `set` calls similarly:
```typescript
(me.root.notificationPrefs as any).$jazz.set("sound", true);
```
becomes:
```typescript
(me.root.settings.notifications as any).$jazz.set("sound", true);
```

- [ ] **Step 3: Run the test suite**

```bash
timeout 90 npm run test 2>&1 | tail -10
```

Expected: passes the `arcan-account-settings` test from Phase 1. Notification-related tests may
need similar field-path updates in test code — fix any that fail.

### Task 8.2: Update `notifications-section.tsx`

**Files:**
- Modify: `src/routes/settings/notifications-section.tsx`

- [ ] **Step 1: Replace `notificationPrefs` references with `settings.notifications`**

Same pattern as Task 8.1. Resolve query, reads, and writes all move to `settings.notifications`.

### Task 8.3: Create the Appearance card

**Files:**
- Create: `src/routes/settings/appearance-section.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/routes/settings/appearance-section.tsx
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useTheme, type Theme } from "@/styles/use-theme";
import { useAccent, ACCENT_KEYS, type Accent } from "@/styles/use-accent";

const ACCENT_SWATCH: Record<Accent, string> = {
  tokyo:  "#7aa2f7",
  violet: "#bb9af7",
  teal:   "#73daca",
  lime:   "#9ece6a",
  amber:  "#e0af68",
  rose:   "#f7768e",
};

export function AppearanceSection() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { settings: { appearance: true } } },
  });
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();

  if (!me.$isLoaded) {
    return (
      <section>
        <h2 className="text-base font-semibold text-text mb-2">Appearance</h2>
        <p className="text-sm text-dim">Loading…</p>
      </section>
    );
  }

  const apply = (next: { theme?: Theme; accent?: Accent }) => {
    if (next.theme) {
      setTheme(next.theme);
      (me.root.settings.appearance as any).$jazz.set("theme", next.theme);
    }
    if (next.accent) {
      setAccent(next.accent);
      (me.root.settings.appearance as any).$jazz.set("accent", next.accent);
    }
  };

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-2">Appearance</h2>
      <div className="bg-panel rounded-r-3 border border-hairline px-4 py-3 flex flex-col gap-4">
        {/* Theme toggle */}
        <div className="flex items-center gap-3">
          <span className="flex-1 text-sm text-text">Theme</span>
          <div
            className="flex gap-0.5 p-0.5 rounded-pill bg-panel-2 border border-hairline"
            data-testid="appearance-theme-toggle"
          >
            {(["light", "dark"] as Theme[]).map((t) => {
              const on = theme === t;
              return (
                <button
                  key={t}
                  data-testid={`theme-${t}`}
                  className={`px-3 py-1 rounded-pill text-xs font-semibold ${on ? "bg-accent text-on-accent" : "text-text-2"}`}
                  onClick={() => apply({ theme: t })}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent picker */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center">
            <span className="flex-1 text-sm text-text">Accent color</span>
            <span className="text-xs text-accent">{accent}</span>
          </div>
          <div className="flex gap-3" data-testid="appearance-accent-picker">
            {ACCENT_KEYS.map((k) => {
              const on = accent === k;
              return (
                <button
                  key={k}
                  data-testid={`accent-${k}`}
                  aria-label={k}
                  className="w-7 h-7 rounded-pill"
                  onClick={() => apply({ accent: k })}
                  style={{
                    background: ACCENT_SWATCH[k],
                    border: on ? "2px solid var(--color-text)" : "2px solid transparent",
                    boxShadow: on ? `0 0 0 2px var(--color-panel)` : "none",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
```

### Task 8.4: Wire AppearanceSection into the settings route

**Files:**
- Modify: `src/routes/settings/index.tsx`

- [ ] **Step 1: Import + render**

Find the settings page entry, import `AppearanceSection`, and render it alongside the existing
sections.

```tsx
import { AppearanceSection } from "./appearance-section";

// In the JSX, somewhere between Account and Notifications sections:
<AppearanceSection />
```

### Task 8.5: Persist theme + accent on user changes (hydration)

Initial paint reads from `<html data-theme data-accent>` attributes. On user sign-in we also need
to hydrate the in-memory React state from the user's persisted preferences (so the providers
reflect persisted values, not the DOM defaults).

**Files:**
- Create: `src/styles/settings-sync.tsx`

- [ ] **Step 1: Write a sync component**

```tsx
// src/styles/settings-sync.tsx
import { useEffect } from "react";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useTheme } from "./use-theme";
import { useAccent } from "./use-accent";

/**
 * Reads me.root.settings.appearance and hydrates ThemeProvider + AccentProvider
 * with the persisted values on sign-in.
 */
export function SettingsSync() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { settings: { appearance: true } } },
  });
  const { setTheme } = useTheme();
  const { setAccent } = useAccent();

  useEffect(() => {
    if (!me.$isLoaded) return;
    const ap = me.root.settings?.appearance;
    if (!ap) return;
    if (ap.theme === "light" || ap.theme === "dark") setTheme(ap.theme);
    if (typeof ap.accent === "string") {
      try {
        setAccent(ap.accent as any);
      } catch {
        // unknown accent value — ignore, defaults stay
      }
    }
  }, [me.$isLoaded, me.root?.settings?.appearance?.theme, me.root?.settings?.appearance?.accent, setTheme, setAccent]);

  return null;
}
```

- [ ] **Step 2: Mount it inside the authenticated branch of App.tsx**

In `App.tsx`, find the place where the authenticated user tree is rendered (i.e. after the
`useAccount(ArcanAccount, ...)` resolves). Mount `<SettingsSync />` once at that level so it can
read me.root and hydrate the providers.

```tsx
import { SettingsSync } from "@/styles/settings-sync";

// inside the authenticated render:
<SettingsSync />
{/* … the rest of the authenticated layout … */}
```

### Task 8.6: Write an interaction test for the Appearance card

**Files:**
- Create: `tests/unit/routes/settings/appearance-section.test.tsx`

- [ ] **Step 1: Write the test (light, focused on theme toggle)**

This test stubs out the Jazz `useAccount` hook because we don't need to round-trip via CoJSON to
prove the providers and DOM update.

```typescript
// tests/unit/routes/settings/appearance-section.test.tsx
import { describe, test, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@/styles/use-theme";
import { AccentProvider } from "@/styles/use-accent";
import { AppearanceSection } from "@/routes/settings/appearance-section";

// Minimal stub of useAccount used by AppearanceSection
vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    root: {
      settings: {
        appearance: {
          theme: "dark",
          accent: "tokyo",
          $jazz: { set: vi.fn() },
        },
      },
    },
  }),
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AccentProvider>{children}</AccentProvider>
    </ThemeProvider>
  );
}

describe("AppearanceSection", () => {
  test("clicking 'light' updates the document attribute", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { getByTestId } = render(
      <Wrap>
        <AppearanceSection />
      </Wrap>
    );
    fireEvent.click(getByTestId("theme-light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  test("clicking an accent swatch updates the document attribute", () => {
    document.documentElement.setAttribute("data-accent", "tokyo");
    const { getByTestId } = render(
      <Wrap>
        <AppearanceSection />
      </Wrap>
    );
    fireEvent.click(getByTestId("accent-violet"));
    expect(document.documentElement.getAttribute("data-accent")).toBe("violet");
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/unit/routes/settings/appearance-section.test.tsx
```

Expected: PASS.

### Task 8.7: Commit Phase 8

- [ ] **Step 1: Commit**

```bash
git add src/routes/settings/appearance-section.tsx src/routes/settings/index.tsx src/routes/settings/notifications-section.tsx src/components/notification-manager.tsx src/App.tsx src/styles/settings-sync.tsx tests/unit/routes/settings/appearance-section.test.tsx
git commit -m "feat(settings): Appearance card + theme/accent persistence

Adds Settings -> Appearance with a theme segmented control (light/dark)
and a 6-swatch accent picker. Changes apply immediately via the Theme
and Accent providers and persist to me.root.settings.appearance for
cross-device sync. SettingsSync hydrates providers from the persisted
values on sign-in.

Also migrates notification-manager + notifications-section to read
from me.root.settings.notifications (replacing the dropped
notificationPrefs field).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 9 · (intentionally folded into Phase 8)

Phase 9 was originally a separate "migrate notification consumers" pass, but Task 8.1 + 8.2 above
already do this work as a prerequisite for the Appearance card. Skip ahead.

---

## Phase 10 · Component library restyle

### Task 10.1: Restyle `src/components/ui/button.tsx`

**Files:**
- Modify: `src/components/ui/button.tsx`

- [ ] **Step 1: Inspect current implementation**

```bash
cat src/components/ui/button.tsx
```

This is a shadcn-style Button with variants. Note the variant names and the className composition
helper (probably `cn`/`cva`).

- [ ] **Step 2: Replace hard-coded color/typography Tailwind classes with token-class equivalents**

For each variant, replace:
- `bg-white` / `bg-slate-*` / `bg-gray-*` → `bg-panel`, `bg-panel-2`, or `bg-bg` per role
- `text-gray-*` → `text-text`, `text-text-2`, or `text-dim`
- `border-gray-*` → `border-hairline`
- `bg-primary` (if any) → `bg-accent`, with `text-on-accent`
- `font-*` literals → `font-body` or `font-mono` per usage
- Add `focus:ring-accent-soft` where focus rings were neutral

Keep the variants and the API stable (no rename).

If unsure about the existing variants, here's a clean reference implementation to use as
inspiration (don't blindly replace — match the existing API):

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-r-3 font-body font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent hover:opacity-90",
        outline: "bg-transparent text-text border border-hairline hover:bg-panel-2",
        ghost:   "bg-transparent text-text-2 hover:bg-panel-2",
        danger:  "bg-transparent text-red border border-red/40 hover:bg-red/10",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
```

- [ ] **Step 3: Run the existing button tests if any; run the full unit suite to catch regressions**

```bash
timeout 90 npm run test 2>&1 | tail -10
```

Expected: tests pass. If any visual snapshot tests exist for the button, update them.

### Task 10.2: Restyle each top-level component

The 17 files in `src/components/` get a token-class restyle pass. Each follows the same pattern.
Here's the canonical replace list (apply via sed where safe; manually otherwise):

**Color/surface replacements** (`bg-*` → token equivalent):

| Tailwind default | Replacement |
|---|---|
| `bg-white` | `bg-panel` |
| `bg-gray-50` / `bg-slate-50` | `bg-panel-2` |
| `bg-gray-100` | `bg-panel-2` |
| `bg-gray-900` / `bg-black` | `bg-bg` |
| `text-gray-900` / `text-black` | `text-text` |
| `text-gray-800` | `text-text` |
| `text-gray-700` / `text-slate-700` | `text-text-2` |
| `text-gray-500` / `text-gray-400` | `text-dim` |
| `border-gray-200` / `border-slate-200` | `border-hairline` |
| `border-gray-300` | `border-hairline` |

**Font replacements:** add `font-body` to existing text containers if not already there;
`font-mono` for code/safety-number renderings.

- [ ] **Step 1: Run a global preview of all classes to be replaced**

```bash
grep -rnE "bg-(white|black|gray-[0-9]+|slate-[0-9]+)|text-(gray-[0-9]+|slate-[0-9]+)|border-(gray-[0-9]+|slate-[0-9]+)" src/components/ --include="*.tsx" | head -40
```

- [ ] **Step 2: Apply the replacements file-by-file**

For each file, use the table above. If a file has tricky cases (e.g. transparent overlays with
`bg-black/40`), leave them with a comment noting they need a token addition (likely
`bg-bg-stage/40` or similar — extend tokens if needed).

You can sed the safe-by-default replacements:

```bash
for f in src/components/*.tsx; do
  sed -i \
    -e 's/bg-white\b/bg-panel/g' \
    -e 's/bg-gray-50\b/bg-panel-2/g' \
    -e 's/bg-gray-100\b/bg-panel-2/g' \
    -e 's/text-gray-900\b/text-text/g' \
    -e 's/text-gray-800\b/text-text/g' \
    -e 's/text-gray-700\b/text-text-2/g' \
    -e 's/text-gray-500\b/text-dim/g' \
    -e 's/text-gray-400\b/text-dim/g' \
    -e 's/border-gray-200\b/border-hairline/g' \
    -e 's/border-gray-300\b/border-hairline/g' \
    "$f"
done
```

Then **manually review** the diff with `git diff src/components/` for any remaining literals.

- [ ] **Step 3: Run the test suite + a smoke render to make sure nothing exploded**

```bash
timeout 90 npm run test 2>&1 | tail -10
npm run build 2>&1 | tail -5
```

Expected: PASS, build success.

### Task 10.3: Commit Phase 10

- [ ] **Step 1: Commit**

```bash
git add src/components/ui/button.tsx src/components/*.tsx
git commit -m "refactor(components): restyle to token-backed Tailwind classes

Replaces hard-coded bg-white/bg-gray-*/text-gray-*/border-gray-* classes
across the existing src/components/ui/button.tsx and 17 top-level
src/components/*.tsx with token equivalents (bg-panel, bg-panel-2,
text-text, text-text-2, text-dim, border-hairline). Component APIs
unchanged; visual identity now driven entirely by tokens.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 11 · Cross-route token audit

### Task 11.1: Apply the same replace pass to routes not covered by Units 1/2/4

**Files:**
- Modify: every `.tsx` in `src/routes/auth/`, `src/routes/onboarding/`, `src/routes/pair/`,
  `src/routes/invite/`, and `src/components/sidebar.tsx`, `src/components/notification-manager.tsx`

- [ ] **Step 1: Run the same sed pass over those folders**

```bash
for d in src/routes/auth src/routes/onboarding src/routes/pair src/routes/invite; do
  for f in $d/*.tsx; do
    sed -i \
      -e 's/bg-white\b/bg-panel/g' \
      -e 's/bg-gray-50\b/bg-panel-2/g' \
      -e 's/bg-gray-100\b/bg-panel-2/g' \
      -e 's/text-gray-900\b/text-text/g' \
      -e 's/text-gray-800\b/text-text/g' \
      -e 's/text-gray-700\b/text-text-2/g' \
      -e 's/text-gray-500\b/text-dim/g' \
      -e 's/text-gray-400\b/text-dim/g' \
      -e 's/border-gray-200\b/border-hairline/g' \
      -e 's/border-gray-300\b/border-hairline/g' \
      "$f"
  done
done
```

- [ ] **Step 2: Verify no stragglers remain**

```bash
grep -rnE "bg-(white|gray-[0-9]+|slate-[0-9]+)|text-(gray-[0-9]+|slate-[0-9]+)|border-(gray-[0-9]+|slate-[0-9]+)" \
  src/routes/auth src/routes/onboarding src/routes/pair src/routes/invite src/components \
  --include="*.tsx" | head -10
```

Expected: no matches. If matches appear, address them manually (likely opacity-suffixed variants
not caught by the sed pattern; e.g. `bg-black/40`).

- [ ] **Step 3: Build + test smoke**

```bash
npm run build 2>&1 | tail -3
timeout 90 npm run test 2>&1 | tail -10
```

Expected: PASS.

### Task 11.2: Commit Phase 11

- [ ] **Step 1: Commit**

```bash
git add src/routes/auth src/routes/onboarding src/routes/pair src/routes/invite src/components
git commit -m "refactor(routes): token-audit pass across auth/onboarding/pair/invite

Cross-route restyle so non-Unit-1/2/4 surfaces (auth, onboarding, pair,
invite, App shell, sidebar, notification-manager) consume the same
tokens as the new Unit 7 design system. No behavior changes; class
renames only.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 12 · Drift prevention + CLAUDE.md

### Task 12.1: Add a pre-commit grep guard against ad-hoc Tailwind color classes

**Files:**
- Create: `scripts/check-tokens.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# scripts/check-tokens.sh — fail if any .tsx file under src/ uses ad-hoc
# Tailwind color/typography classes instead of design tokens.
#
# Run manually or via a pre-commit hook. Exit 1 on violations.
set -euo pipefail

PATTERNS='bg-(white|black|gray-[0-9]+|slate-[0-9]+|zinc-[0-9]+|neutral-[0-9]+)|text-(gray-[0-9]+|slate-[0-9]+|zinc-[0-9]+)|border-(gray-[0-9]+|slate-[0-9]+|zinc-[0-9]+)'

hits=$(grep -rnE "$PATTERNS" src --include="*.tsx" 2>/dev/null || true)

if [ -n "$hits" ]; then
  echo "❌ ad-hoc Tailwind color/typography classes found — use tokens instead:"
  echo "$hits"
  echo
  echo "Token cheatsheet:"
  echo "  bg-white → bg-panel        text-gray-800 → text-text"
  echo "  bg-gray-100 → bg-panel-2   text-gray-500 → text-dim"
  echo "  border-gray-200 → border-hairline"
  exit 1
fi

echo "✓ no ad-hoc Tailwind color/typography classes detected"
```

- [ ] **Step 2: chmod +x**

```bash
chmod +x scripts/check-tokens.sh
```

- [ ] **Step 3: Add an npm script and run it once to confirm it passes after Phase 11**

In `package.json`, under `"scripts"`, add:

```json
"check-tokens": "./scripts/check-tokens.sh",
```

Then:

```bash
npm run check-tokens
```

Expected output: `✓ no ad-hoc Tailwind color/typography classes detected`.

### Task 12.2: Update CLAUDE.md with the Visual conventions section

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append a new section**

After the existing "Conventions" section in `CLAUDE.md`, add:

```markdown
## Visual conventions

- All colors, typography, spacing, and motion go through tokens defined in `src/styles/tokens.css`. Use the Tailwind utility names that map to them (`bg-panel`, `text-text`, `border-hairline`, `font-mono`, etc.) — never raw `bg-white`, `text-gray-*`, `border-gray-*`, or font-family literals.
- Theme is reactive: read via `useTheme()` from `@/styles/use-theme`. Persist via `me.root.settings.appearance.theme`. Light + dark only.
- Accent is six values (tokyo/violet/teal/lime/amber/rose). Read via `useAccent()`; persist via `me.root.settings.appearance.accent`.
- For brand surfaces, use `<Lattice size={n} />` from `@/components/lattice`. Tier auto-selected from `size`.
- For success/error/copy confirmations, prefer `useToast({ tone })` over inline status messages.
- For loading states, use the skeleton primitives from `@/components/skeleton` — not `"Loading…"` text.
- The pre-commit guard `scripts/check-tokens.sh` will reject ad-hoc Tailwind color/typography classes; run `npm run check-tokens` locally before committing UI work.
```

### Task 12.3: Commit Phase 12

- [ ] **Step 1: Commit**

```bash
git add scripts/check-tokens.sh package.json CLAUDE.md
git commit -m "chore: add token-drift check + CLAUDE.md visual conventions

scripts/check-tokens.sh + npm run check-tokens fails on ad-hoc
Tailwind color/typography classes outside of the token system.
CLAUDE.md gets a Visual conventions section so future sessions
inherit the discipline.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 13 · Unit 5 color touch (`#0a0a0a` → `#0a0b11`)

### Task 13.1: Update the PWA manifest and the HTML meta

**Files:**
- Modify: `public/manifest.webmanifest`
- Modify: `index.html`

- [ ] **Step 1: Replace the two color literals**

```bash
sed -i 's/#0a0a0a/#0a0b11/g' public/manifest.webmanifest index.html
```

- [ ] **Step 2: Verify**

```bash
grep -nE "0a0a0a|0a0b11" public/manifest.webmanifest index.html
```

Expected: only `0a0b11` appears.

### Task 13.2: Commit Phase 13

- [ ] **Step 1: Commit**

```bash
git add public/manifest.webmanifest index.html
git commit -m "rebrand: bump PWA + meta theme color from #0a0a0a to #0a0b11

Aligns with the hi-fi prototype's body background. One value swap in
manifest theme_color + background_color and index.html meta theme-color.
Fulfills the Unit 5 design-driven touch from the 2026-06-08 alignment.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 14 · Final verification

### Task 14.1: Full test suite + build

- [ ] **Step 1: Run everything**

```bash
timeout 120 npm run test 2>&1 | tail -10
cd api && npx vitest run && cd ..
timeout 90 npm run build 2>&1 | tail -5
npm run check-tokens
```

Expected: PASS · PASS · build success · check-tokens passes.

### Task 14.2: Local smoke test of the design system

- [ ] **Step 1: Start the dev stack**

```bash
# Three terminals (or background processes):
npm run sync &
LINEAR_API_TOKEN=dummy BETTER_AUTH_SECRET=$(head -c 32 /dev/urandom | base64) npm run api &
npm run dev &
sleep 5
```

- [ ] **Step 2: Manually verify** http://localhost:5173 in a browser:

- Welcome page renders in dark theme with Nox Noir styling.
- Sign in, navigate to Settings → Appearance.
- Toggle theme to "light" — page reflows immediately to the light palette.
- Pick each accent — buttons/highlights re-color immediately.
- Refresh the page — your selection persists (read from `me.root.settings.appearance`).
- Toast triggers somewhere (e.g. settings save) display in the new style.
- Loading paths show skeletons rather than "Loading…" text.

- [ ] **Step 3: Stop dev processes**

```bash
pkill -f "npm run dev" || true
pkill -f "npm run api" || true
pkill -f "npm run sync" || true
```

### Task 14.3: Push and open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin unit-7-design-system-foundation
```

- [ ] **Step 2: Open a PR** via `gh pr create` (or surface the link to the user for manual PR).

```bash
gh pr create --title "Unit 7: Design system foundation" --body "$(cat <<'EOF'
## Summary

Lays the Nox Noir design-system foundation for the UI rework.

- Tokens (`src/styles/tokens.css`) — palette / typography / spacing / radii / motion for dark + light, six accents
- Self-hosted Inter + JetBrains Mono via `@fontsource`
- Theme + accent providers (`useTheme`, `useAccent`) persisted on `me.root.settings.appearance`
- `me.root.notificationPrefs` → nested `me.root.settings.notifications` (destructive)
- Lattice logo component (4 tiers)
- Toast provider + `useToast`
- Skeleton primitives (`Skel`, `NavListSkeleton`, `ChatHeaderSkeleton`, `ChatMessagesSkeleton`)
- Component-library restyle (`src/components/ui/button.tsx` + 17 top-level components)
- Cross-route token-audit pass (auth, onboarding, pair, invite, App shell, sidebar)
- Settings → Appearance card (theme toggle + 6-swatch accent picker)
- `scripts/check-tokens.sh` + CLAUDE.md "Visual conventions"
- Unit 5 touch: PWA theme color `#0a0a0a` → `#0a0b11`

## Test plan

- [ ] Unit tests pass (`npm run test`)
- [ ] API tests pass (`cd api && npx vitest run`)
- [ ] Build succeeds (`npm run build`)
- [ ] `npm run check-tokens` passes
- [ ] Manual smoke: theme toggle reflows; accent picker recolors; settings persist across reload
EOF
)"
```

---

## Self-review checklist

- [ ] Spec coverage: every Unit 7 bullet (tokens, fonts, Lattice, settings CoMap, theme + accent, toasts, skeletons, component restyle, cross-route audit, drift prevention, CLAUDE.md, Unit 5 touch) has a task.
- [ ] No "TBD", "TODO (later)", or vague language.
- [ ] All function/type/prop names used in later tasks match earlier definitions (e.g. `useTheme`/`setTheme`, `useAccent`/`setAccent`, `Lattice` size prop, `useToast` options shape).
- [ ] Every code step shows actual code, not a description.
- [ ] Destructive baseline respected — no migration code anywhere.
- [ ] The plan ends with verification + a real push step (not a vague "ship it").
