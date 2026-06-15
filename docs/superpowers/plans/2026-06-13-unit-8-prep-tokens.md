# Unit 8 Prep · Tokens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three gradient tokens (`--gradient-primary`, `--gradient-rule`, `--gradient-cosmic`) to `src/styles/tokens.css` and expose them as Tailwind utilities (`bg-gradient-primary`, `bg-gradient-rule`, `bg-gradient-cosmic`) so Phase B sub-units can adopt the design's gradient flourishes without inventing ad-hoc literals.

**Architecture:** All three are pure CSS custom-property additions in `:root` of `src/styles/tokens.css`, layered on top of existing accent tokens (`--color-accent-grad-0`, `--color-accent-grad-1`) and surface tokens (`--color-panel`, `--color-panel-2`, `--color-bg`). The Tailwind config grows three `backgroundImage` entries pointing at the new vars. No component code changes — surfaces that need these gradients will adopt the utilities in their respective Phase B sub-units (8a AuthSurface, 8b EmptyPane, etc.).

**Tech Stack:** Pure CSS custom properties (no preprocessor); Tailwind v3 `theme.extend.backgroundImage`; Vitest unit test against `tokens.css?raw` import.

**Spec context:**
- Unit 8 design: `docs/superpowers/specs/2026-06-13-unit-8-final-alignment-design.md`
- Unit 8 Phase A audit (Tokens diff section): `docs/superpowers/specs/2026-06-13-unit-8-audit.md`
- Reference values: `design/nox-tokens.css` (extracted from `ArcanUI.zip`; gitignored — re-extract via `python3 -c "import zipfile; zipfile.ZipFile('ArcanUI.zip').extractall('design/')"` if not present locally)

---

## Naming rename — design `--nox-grad-*` → live `--gradient-*`

The reference file uses the `--nox-*` prefix (`--nox-grad-primary` etc.) because design's tokens are a self-contained `NOX DESIGN SYSTEM` block. Live tokens.css follows a different convention: a flat namespace keyed by category prefix (`--color-*`, `--font-*`, `--fs-*`, `--lh-*`, `--sp-*`, `--r-*`, `--bw-*`, `--shadow-*`, `--ease-*`, `--dur-*`, `--tracking-*`, `--content-*`). We harmonize by dropping the `--nox-` prefix and using `--gradient-*` as a new category sibling. The mapping is:

| design name | live name | rationale |
|---|---|---|
| `--nox-grad-primary` | `--gradient-primary` | matches `--color-*` / `--font-*` flat category style |
| `--nox-grad-rule` | `--gradient-rule` | same |
| `--nox-grad-cosmic` | `--gradient-cosmic` | same |

Inside the gradient definitions, the design's `var(--nox-blue)` and `var(--nox-violet)` references map to **live's accent-grad pair** (`var(--color-accent-grad-0)` and `var(--color-accent-grad-1)`). This is a deliberate enrichment: design hardcodes the blue→violet sweep, but live's accent system already encodes a two-color sweep per accent (e.g. tokyo flips to blue→violet, violet flips to violet→blue, teal flips to teal→cyan, etc. — see `src/styles/tokens.css:130-135`). Using the accent-grad pair makes `--gradient-primary` auto-respect the user's accent choice, which is the strictly-more-general behavior.

For `--gradient-cosmic`, the design's `var(--nox-panel) → var(--nox-void)` maps to `var(--color-panel) → var(--color-bg)`, and the design's literal `#1a1a2e` maps to `var(--color-panel-2)` (live's `#1a1d2e` — 3 units off in green; close enough that going via the token wins for theme-awareness in light theme over preserving the literal).

---

## File Structure

Two files touched, ~15 lines added total:

- **Modify:** `src/styles/tokens.css` — add three `--gradient-*` custom property declarations inside `:root`.
- **Modify:** `tailwind.config.ts` — add `backgroundImage` block under `theme.extend` mapping the three utility names to the new vars.
- **Modify:** `tests/unit/styles/tokens.test.ts` — extend the existing smoke test with a single `test()` block asserting the three tokens are present.

No new files. No component changes. Diff target: under 20 lines.

---

## Phase 0 · Setup

### Task 0.1: Create + check out the branch

- [ ] **Step 1: Verify clean working tree on `main`**

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git status --short
git rev-parse --abbrev-ref HEAD
```

Expected: working tree is clean (untracked `.claude/`, `ArcanUI.zip`, `playwright.visual.config.ts`, `tests/visual/` are fine to leave); current branch is `main`.

- [ ] **Step 2: Create + check out `unit-8-prep-tokens` off `main`**

```bash
git checkout -b unit-8-prep-tokens
```

Expected: `Switched to a new branch 'unit-8-prep-tokens'`.

- [ ] **Step 3: Verify the design reference is present locally**

```bash
ls design/nox-tokens.css
```

Expected: file exists. If not, re-extract:

```bash
python3 -c "import zipfile; zipfile.ZipFile('ArcanUI.zip').extractall('design/')"
ls design/nox-tokens.css
```

Expected: file now exists.

- [ ] **Step 4: Confirm the three target tokens exist in the design reference**

```bash
grep -E -- '--nox-grad-(primary|rule|cosmic)' design/nox-tokens.css
```

Expected output (three matches):

```
  --nox-grad-primary: linear-gradient(90deg, var(--nox-blue), var(--nox-violet));
  --nox-grad-rule:    linear-gradient(90deg, var(--nox-blue), var(--nox-violet), transparent);
  --nox-grad-cosmic:  radial-gradient(ellipse 80% 60% at 90% 10%, var(--nox-panel) 0%, var(--nox-void) 60%),
```

(The cosmic gradient is multi-line in the source — the grep only catches its first line, that's fine.)

---

## Phase 1 · Tokens (TDD)

### Task 1.1: Extend the tokens smoke test to assert the three new gradient tokens

**Files:**
- Modify: `tests/unit/styles/tokens.test.ts`

- [ ] **Step 1: Add the failing test**

Append a new `test()` block inside the existing `describe("tokens.css", ...)` block. Use Edit to insert before the closing `});` of the describe block:

Existing tail of the file (for context):

```typescript
  test("declares the light theme overrides", () => {
    expect(tokensCss).toContain('data-theme="light"');
  });
});
```

Change to:

```typescript
  test("declares the light theme overrides", () => {
    expect(tokensCss).toContain('data-theme="light"');
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/styles/tokens.test.ts
```

Expected: 3 of 4 tests pass; the new "declares the three gradient tokens used by Phase B sub-units" test FAILS with messages like `expected ... to contain "--gradient-primary:"`.

### Task 1.2: Add the three gradient tokens to `src/styles/tokens.css`

**Files:**
- Modify: `src/styles/tokens.css`

- [ ] **Step 1: Insert the gradient block inside `:root`**

The existing `:root` block ends with the accent fallback (lines 95-101). Find this section:

```css
  /* Default accent fallback (tokyo) — overridden by [data-accent] selectors below */
  --color-accent: #7aa2f7;
  --color-accent-grad-0: #7aa2f7;
  --color-accent-grad-1: #bb9af7;
  --color-accent-soft: rgba(122, 162, 247, 0.16);
  --color-accent-border: rgba(122, 162, 247, 0.5);
  --color-on-accent: #ffffff;
}
```

Change to:

```css
  /* Default accent fallback (tokyo) — overridden by [data-accent] selectors below */
  --color-accent: #7aa2f7;
  --color-accent-grad-0: #7aa2f7;
  --color-accent-grad-1: #bb9af7;
  --color-accent-soft: rgba(122, 162, 247, 0.16);
  --color-accent-border: rgba(122, 162, 247, 0.5);
  --color-on-accent: #ffffff;

  /* Gradients — adopted from design/nox-tokens.css (renamed --nox-grad-* → --gradient-*).
     Primary + rule reference the accent-grad pair so they auto-respect data-accent flips.
     Cosmic uses surface tokens (--color-panel, --color-panel-2, --color-bg) so it adapts
     across light/dark theme. See docs/superpowers/plans/2026-06-13-unit-8-prep-tokens.md. */
  --gradient-primary: linear-gradient(90deg, var(--color-accent-grad-0), var(--color-accent-grad-1));
  --gradient-rule: linear-gradient(90deg, var(--color-accent-grad-0), var(--color-accent-grad-1), transparent);
  --gradient-cosmic:
    radial-gradient(ellipse 80% 60% at 90% 10%, var(--color-panel) 0%, var(--color-bg) 60%),
    radial-gradient(ellipse 50% 40% at 10% 90%, var(--color-panel-2) 0%, var(--color-bg) 50%);
}
```

- [ ] **Step 2: Run the tokens test to verify it passes**

```bash
npx vitest run tests/unit/styles/tokens.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 3: Run the tokens guard to confirm no regression**

```bash
npm run check-tokens
```

Expected: `✓ no ad-hoc Tailwind color/typography classes detected` — the guard only scans `.tsx` files under `src/`, so CSS changes can't trip it, but we run it anyway to confirm the diff is sane.

- [ ] **Step 4: Run typecheck to confirm no breakage**

```bash
npx tsc -b --noEmit
```

Expected: no output (clean exit code 0). If you see errors unrelated to this change, they predate this branch — investigate before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/styles/tokens.css tests/unit/styles/tokens.test.ts
git commit -m "feat(tokens): add --gradient-primary, --gradient-rule, --gradient-cosmic

Lifted from design/nox-tokens.css (--nox-grad-*) per Unit 8 Phase A audit.
Renamed to --gradient-* to match live's flat-category convention (--color-*,
--font-*, --space-*). Primary + rule reference --color-accent-grad-0/1 so
they auto-respect the user's accent choice. Cosmic uses --color-panel /
--color-panel-2 / --color-bg so it adapts across light + dark themes.

Refs: docs/superpowers/specs/2026-06-13-unit-8-audit.md (Tokens diff section)"
```

Expected: commit succeeds; no pre-commit hooks fail.

---

## Phase 2 · Tailwind utilities

### Task 2.1: Add `bg-gradient-*` utilities to `tailwind.config.ts`

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Add a `backgroundImage` block under `theme.extend`**

Open `tailwind.config.ts` and find this section (the end of `extend`):

```typescript
      boxShadow: {
        'level-1': 'var(--shadow-1)',
        'level-2': 'var(--shadow-2)',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

Change to:

```typescript
      boxShadow: {
        'level-1': 'var(--shadow-1)',
        'level-2': 'var(--shadow-2)',
      },
      backgroundImage: {
        // Gradient tokens — see src/styles/tokens.css.
        // Usage: <div className="bg-gradient-primary"> etc.
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-rule': 'var(--gradient-rule)',
        'gradient-cosmic': 'var(--gradient-cosmic)',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 2: Verify the Tailwind config still type-checks**

```bash
npx tsc -b --noEmit
```

Expected: no output (clean exit code 0).

- [ ] **Step 3: Verify Tailwind resolves the new utilities**

Run the production build to force Tailwind to generate its full output. The build emits CSS that we can grep for the new utility class names:

```bash
npx vite build 2>&1 | tail -20
```

Expected: build completes successfully (look for `✓ built in`). If the build fails for any reason unrelated to tokens (e.g. existing TS error), investigate.

Then inspect the emitted CSS for the new utility names:

```bash
grep -h -E 'bg-gradient-(primary|rule|cosmic)' dist/assets/*.css | head -10
```

Expected output (the three classes appear, each backed by `var(--gradient-*)`):

```
.bg-gradient-primary{background-image:var(--gradient-primary)}
.bg-gradient-rule{background-image:var(--gradient-rule)}
.bg-gradient-cosmic{background-image:var(--gradient-cosmic)}
```

If the classes don't appear, it's because Tailwind only ships utilities that are actually referenced in source under `content: [...]`. To force-emit for verification, temporarily add a throwaway `<div className="bg-gradient-primary bg-gradient-rule bg-gradient-cosmic" />` to `src/App.tsx`, re-run `npx vite build`, re-grep, then revert that throwaway edit before committing.

- [ ] **Step 4: Run the full unit suite to confirm nothing regressed**

```bash
npx vitest run
```

Expected: all tests pass, including the 4 tokens tests from Phase 1.

- [ ] **Step 5: Run the tokens guard one final time**

```bash
npm run check-tokens
```

Expected: `✓ no ad-hoc Tailwind color/typography classes detected`.

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(tokens): expose bg-gradient-primary/rule/cosmic Tailwind utilities

Maps the three new --gradient-* custom properties to Tailwind utilities so
Phase B sub-units (8a AuthSurface, 8b EmptyPane, etc.) can adopt them as
className=\"bg-gradient-cosmic\" instead of inline style.

Refs: docs/superpowers/specs/2026-06-13-unit-8-audit.md"
```

Expected: commit succeeds.

---

## Phase 3 · Final verification

### Task 3.1: Full verification pass

- [ ] **Step 1: Confirm the diff size is at or under the 20-line target**

```bash
git diff main...HEAD -- src/styles/tokens.css tailwind.config.ts tests/unit/styles/tokens.test.ts | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | wc -l
```

Expected: a number at or under ~25 (the 20-line target is for production source — the test additions push it slightly higher; that's fine).

- [ ] **Step 2: Re-run the three verification commands listed in the constraints**

```bash
npm run check-tokens
npx tsc -b --noEmit
npx vitest run
```

Expected:
- `check-tokens` → `✓ no ad-hoc Tailwind color/typography classes detected`
- `tsc` → clean exit, no output
- `vitest` → all tests pass, including 4 tokens tests

- [ ] **Step 3: Confirm the branch is in good shape for review**

```bash
git log --oneline main..HEAD
git status --short
```

Expected: two commits visible (`feat(tokens): add --gradient-*…` and `feat(tokens): expose bg-gradient-*…`); working tree clean.

---

## Self-review checklist

**Spec coverage:**

- [x] All three gradient tokens from the audit's "Tokens diff" section are added to `tokens.css` (`--gradient-primary`, `--gradient-rule`, `--gradient-cosmic`). Phase 1 / Task 1.2.
- [x] Naming aligns with live convention (`--gradient-*` instead of `--nox-grad-*`); rename documented at the top of this plan.
- [x] Tailwind utilities are added (`bg-gradient-primary`, `bg-gradient-rule`, `bg-gradient-cosmic`). Phase 2 / Task 2.1.
- [x] TDD: failing test in Task 1.1 → implementation in Task 1.2 → green. Commit-per-task structure preserved (2 commits).
- [x] Verification commands from constraints (`npm run check-tokens`, `npx tsc -b --noEmit`, `npx vitest run`) run as the final pass in Phase 3.

**Placeholder scan:**

- [x] No "TBD" / "TODO" / "implement later" anywhere.
- [x] Every code-changing step shows the actual code block.
- [x] Test bodies are written in full.
- [x] Commit messages are written in full.

**Type consistency:**

- [x] Token names referenced in the Tailwind config (`var(--gradient-primary)` etc.) match exactly what's added to `tokens.css`.
- [x] Tailwind utility names referenced in the test/verify step (`bg-gradient-primary` etc.) match exactly what's mapped in `tailwind.config.ts`.
- [x] No references to types, variables, or functions defined nowhere.

**Scope discipline:**

- [x] No CSS files touched beyond `tokens.css` (per constraint).
- [x] No `tailwind.config.js` references (the project uses `tailwind.config.ts`).
- [x] No component-level adoptions of the new utilities — those land in Phase B sub-units as planned.

---

## Execution handoff

Plan complete. Two execution options on the table — Subagent-Driven (fresh subagent per task, reviewed between) or Inline Execution (executing-plans, batched). The plan is short (5 implementation steps across 3 phases), so either approach is reasonable; Inline Execution is probably the right call given the size.
