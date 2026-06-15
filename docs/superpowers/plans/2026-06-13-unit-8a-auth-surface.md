# Unit 8a — AuthSurface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `<AuthSurface>` — the shared cosmic full-bleed primitive (Lattice watermark + scattered stars + centered narrow card) — plus the `<Wordmark>` and `<Steps>` companions, then adopt them in all nine auth / onboarding / pair / profile routes with lowercase typography and force-dark theming, closing AUDIT rows 001–006, 025–028, 039–042 from the Unit 8 Phase A audit.

**Architecture:** Three new presentational primitives in `src/components/auth-surface.tsx` — pure layout, no state, no data fetching, no router knowledge. The cosmic backdrop is a `position: relative` flex container with an absolutely-positioned `<Lattice mono>` watermark bleeding off the bottom-right and four absolutely-positioned star dots; the card column is the children slot. A `forceDark` prop on `<AuthSurface>` temporarily pins `data-theme="dark"` on `<html>` while the surface is mounted (via `useEffect` cleanup back to the previous value). Routes consume the surface as a thin wrapper and lose their existing `min-h-screen flex bg-background` outer divs.

**Tech Stack:** TypeScript strict, React 18, Tailwind v3 with Arcan token utilities (`bg-bg`, `bg-panel`, `text-text`, `text-dim`, `border-hairline`, `bg-arcan-accent`, `bg-panel-2`), `@/components/lattice` (existing), Vitest + React Testing Library for unit, Playwright (existing visual capture toolkit) for spot-check only.

**Spec / audit rows covered:**
- `docs/superpowers/specs/2026-06-13-unit-8-audit.md` — AUDIT-001, AUDIT-002, AUDIT-003, AUDIT-004, AUDIT-005, AUDIT-006, AUDIT-025, AUDIT-026, AUDIT-027, AUDIT-028, AUDIT-039, AUDIT-040, AUDIT-041, AUDIT-042
- Reference design: `design/hf-flows.jsx` (lines 7–63 for `AuthSurface` + `Wordmark` + `Steps` + `Title` + `Sub`)

**Branch base:** Off `main` at `f3187a2` (Phase A merge). If main has already advanced (e.g. to `fe7cb79` for the prep-tokens plan), branch off the latest `main` — there's no merge conflict expected because prep-tokens only touches `src/styles/tokens.css` and `tailwind.config.ts`.

**Soft dependency:** `Prep · Tokens` (introduces `--gradient-cosmic`). This plan does not require it — none of the tasks below consume `--gradient-cosmic`. If `bg-gradient-cosmic` ships by the time this plan executes, the `<AuthSurface>` backdrop can be promoted from `bg-bg` to `bg-gradient-cosmic` in a single one-line follow-up. We keep the primitive on `bg-bg` for now so this plan is unblocked.

---

## Phase 0 · Setup

### Task 0.1: Branch + verify clean tree

- [ ] **Step 1: Verify working tree is clean and branch**

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git status --short
# expected: empty (no staged or unstaged changes)
git fetch origin
git checkout main
git pull --ff-only
git checkout -b unit-8a-auth-surface
```

Expected: `Switched to a new branch 'unit-8a-auth-surface'`.

- [ ] **Step 2: Verify baseline checks pass on this branch**

```bash
npm run check-tokens
npx tsc -b --noEmit
npx vitest run
```

Expected: all three exit 0. Do not proceed to Phase 1 if any baseline fails — surface the failure first.

---

## Phase 1 · The `<AuthSurface>` primitive + companions

We build the three primitives behind tests, then routes adopt them. The file `src/components/auth-surface.tsx` ends up exporting **`AuthSurface`**, **`Wordmark`**, **`Steps`**, **`AuthTitle`**, **`AuthSub`**.

### Task 1.1: Failing tests for `<AuthSurface>` backdrop

**Files:**
- Create: `tests/unit/components/auth-surface.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// tests/unit/components/auth-surface.test.tsx
import { describe, test, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AuthSurface, Wordmark, Steps } from "@/components/auth-surface";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("<AuthSurface />", () => {
  test("renders a full-bleed cosmic backdrop with the Lattice watermark", () => {
    const { container } = render(
      <AuthSurface>
        <span data-testid="child">hi</span>
      </AuthSurface>,
    );
    // Outer surface is full-bleed dark.
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.className).toMatch(/min-h-screen/);
    expect(root.className).toMatch(/bg-bg/);
    // Lattice watermark is rendered as an SVG with role="img".
    const lattices = container.querySelectorAll("svg[role='img']");
    expect(lattices.length).toBeGreaterThanOrEqual(1);
    // Children render in the centered card column.
    expect(container.querySelector("[data-testid='child']")).not.toBeNull();
  });

  test("renders exactly four scattered cosmic stars", () => {
    const { container } = render(<AuthSurface>x</AuthSurface>);
    const stars = container.querySelectorAll("[data-auth-star]");
    expect(stars.length).toBe(4);
  });

  test("default card column width is 320px", () => {
    const { container } = render(<AuthSurface>x</AuthSurface>);
    const col = container.querySelector("[data-auth-column]") as HTMLElement;
    expect(col).not.toBeNull();
    expect(col.style.width).toBe("320px");
  });

  test("respects the `w` prop for card column width", () => {
    const { container } = render(<AuthSurface w={368}>x</AuthSurface>);
    const col = container.querySelector("[data-auth-column]") as HTMLElement;
    expect(col.style.width).toBe("368px");
  });

  test("tall variant pins the column to the top and allows scroll", () => {
    const { container } = render(<AuthSurface tall>x</AuthSurface>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/items-start/);
    expect(root.className).toMatch(/overflow-auto/);
  });

  test("force-dark sets html[data-theme='dark'] while mounted and restores on unmount", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const { unmount } = render(<AuthSurface forceDark>x</AuthSurface>);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    unmount();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("<Wordmark />", () => {
  test("renders a centered Arcan Lattice + 'arcan' wordmark", () => {
    const { container, getByText } = render(<Wordmark size={26} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/justify-center/);
    expect(getByText("arcan")).not.toBeNull();
    // Lattice SVG present
    expect(container.querySelector("svg[role='img']")).not.toBeNull();
  });
});

describe("<Steps />", () => {
  test("renders four dashes by default with the first `n` filled with arcan-accent", () => {
    const { container } = render(<Steps n={2} />);
    const dashes = container.querySelectorAll("[data-auth-step]");
    expect(dashes.length).toBe(4);
    // First two filled, last two unfilled.
    expect((dashes[0] as HTMLElement).className).toMatch(/bg-arcan-accent/);
    expect((dashes[1] as HTMLElement).className).toMatch(/bg-arcan-accent/);
    expect((dashes[2] as HTMLElement).className).toMatch(/bg-panel-2/);
    expect((dashes[3] as HTMLElement).className).toMatch(/bg-panel-2/);
  });

  test("supports a custom `of` count", () => {
    const { container } = render(<Steps n={1} of={5} />);
    expect(container.querySelectorAll("[data-auth-step]").length).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail with "module not found"**

Run: `npx vitest run tests/unit/components/auth-surface.test.tsx`

Expected: FAIL with `Cannot find module '@/components/auth-surface'` (or equivalent).

### Task 1.2: Implement `<AuthSurface>`, `<Wordmark>`, `<Steps>`, `<AuthTitle>`, `<AuthSub>`

**Files:**
- Create: `src/components/auth-surface.tsx`

- [ ] **Step 1: Write the component file**

Reference design source: `design/hf-flows.jsx` lines 7–63. The translation table:

| Design (inline style) | Tailwind class (this file) |
|---|---|
| `flex: 1, position: 'relative', display: 'flex'` | `min-h-screen w-full relative flex` |
| `alignItems: tall ? 'flex-start' : 'center'` | `tall ? items-start : items-center` |
| `justifyContent: 'center'` | `justify-center` |
| `background: c.bg` | `bg-bg` |
| `overflow: tall ? 'auto' : 'hidden'` | `tall ? overflow-auto : overflow-hidden` |
| Watermark `right: -84, bottom: -96, opacity 0.05` | absolute right/bottom inline style, `opacity-[0.05]` |
| Card column `width: w, maxWidth: '88%', flexDirection: 'column'` | inline `width` style, `max-w-[88%] flex flex-col` |
| Card column `gap: tall ? 11 : 15, padding: tall ? '20px 18px' : 18` | inline `gap` + `padding` style |
| Star `position: 'absolute', borderRadius: sz` | absolute, inline width/height/borderRadius/background/boxShadow |

```tsx
// src/components/auth-surface.tsx
import { useEffect, type ReactNode, type CSSProperties } from "react";
import { Lattice } from "@/components/lattice";

/**
 * AuthSurface: shared cosmic full-bleed backdrop used by every
 * pre-authenticated auth flow (sign-in, recovery, onboarding steps),
 * QR pairing (initiator + responder), and the polymorphic profile view.
 *
 * Design source: design/hf-flows.jsx, function AuthSurface (lines 12-29).
 *
 * Layout:
 *   - `min-h-screen` flex container, dark by default (`bg-bg`).
 *   - Oversized pale Arcan Lattice watermark bleeding off the bottom-right
 *     corner (opacity 0.05) — uses currentColor so it inherits `text-text`.
 *   - 4 scattered cosmic stars (small absolutely-positioned dots) at
 *     deterministic positions per the design.
 *   - Centered narrow card column for the children (default 320px).
 *
 * Props:
 *   - w           — card column width in px (default 320)
 *   - tall        — when true, aligns column to top and enables vertical
 *                   scroll (for steps with grids that exceed the viewport,
 *                   e.g. backup-display 24-word grid).
 *   - forceDark   — temporarily pins <html data-theme="dark"> while the
 *                   surface is mounted, restoring the previous value on
 *                   unmount. Auth surfaces are dark by design (Headline #1
 *                   in the audit doc).
 *   - children    — the centered card column contents.
 */
export interface AuthSurfaceProps {
  w?: number;
  tall?: boolean;
  forceDark?: boolean;
  children: ReactNode;
}

export function AuthSurface({
  w = 320,
  tall = false,
  forceDark = false,
  children,
}: AuthSurfaceProps) {
  // Force-dark: pin <html data-theme="dark"> while this surface is mounted.
  useEffect(() => {
    if (!forceDark) return;
    const html = document.documentElement;
    const prev = html.getAttribute("data-theme");
    html.setAttribute("data-theme", "dark");
    return () => {
      if (prev === null) html.removeAttribute("data-theme");
      else html.setAttribute("data-theme", prev);
    };
  }, [forceDark]);

  const rootCls = [
    "min-h-screen w-full relative flex justify-center bg-bg",
    tall ? "items-start overflow-auto" : "items-center overflow-hidden",
  ].join(" ");

  const columnStyle: CSSProperties = {
    width: `${w}px`,
    maxWidth: "88%",
    gap: tall ? 11 : 15,
    padding: tall ? "20px 18px" : 18,
  };

  return (
    <div className={rootCls} data-auth-surface="">
      {/* Cosmic watermark — oversized pale Arcan Lattice bleeding off
          the bottom-right. Uses `mono` so it inherits text-text via
          currentColor; opacity is tuned for dark theme. */}
      <div
        aria-hidden="true"
        className="absolute pointer-events-none select-none opacity-[0.05] text-text"
        style={{ right: -84, bottom: -96, width: 360, height: 360 }}
      >
        <Lattice size={360} mono />
      </div>

      {/* Four scattered cosmic stars at deterministic positions. */}
      <Star x="22%" y="20%" color="var(--color-accent)" size={4} glow />
      <Star x="72%" y="26%" color="#bb9af7" size={3} glow />
      <Star x="30%" y="74%" color="#7dcfff" size={3} glow />
      <Star x="80%" y="66%" color="var(--color-accent)" size={2} />

      {/* Centered narrow card column. */}
      <div
        data-auth-column=""
        className="relative flex flex-col"
        style={columnStyle}
      >
        {children}
      </div>
    </div>
  );
}

interface StarProps {
  x: string;
  y: string;
  color: string;
  size: number;
  glow?: boolean;
}

function Star({ x, y, color, size, glow }: StarProps) {
  const style: CSSProperties = {
    position: "absolute",
    left: x,
    top: y,
    width: size,
    height: size,
    borderRadius: size,
    background: color,
    boxShadow: glow ? `0 0 10px ${color}99` : "none",
  };
  return <div data-auth-star="" aria-hidden="true" style={style} />;
}

/**
 * Wordmark: centered Arcan Lattice glyph + "arcan" text — used at the top
 * of every auth/onboarding/pair surface.
 *
 * Design source: design/hf-flows.jsx, function Wordmark (lines 7-9), plus
 * design/hf-kit.jsx#ArcanMark (lines 199-241) for the stacked layout
 * reference (mark above, tracked-uppercase "arcan" beneath).
 */
export interface WordmarkProps {
  size?: number;
}

export function Wordmark({ size = 26 }: WordmarkProps) {
  // Design's Wordmark calls ArcanMark with `size * 2.1` for the glyph.
  // We keep the live <Lattice> at the user-facing `size` since our Lattice
  // already scales correctly via the `size` prop; the design's doubling
  // is a quirk of its inline SVG handling. Visually compare during
  // Phase 5 spot-check and tune if needed.
  const labelFs = Math.round(size * 0.5);
  return (
    <div className="flex flex-col items-center" style={{ gap: Math.round(size * 0.2) }}>
      <Lattice size={size} />
      <span
        className="font-mono text-text uppercase"
        style={{
          fontSize: labelFs,
          letterSpacing: "0.5em",
          paddingLeft: "0.5em", // optical centering — the trailing letter-spacing pulls the visual centroid right
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        arcan
      </span>
    </div>
  );
}

/**
 * Steps: progress indicator — row of `of` dashes, with the first `n`
 * filled accent and the rest filled panel-2.
 *
 * Design source: design/hf-flows.jsx, function Steps (lines 31-34).
 */
export interface StepsProps {
  n: number;
  of?: number;
}

export function Steps({ n, of = 4 }: StepsProps) {
  return (
    <div className="flex justify-center gap-[5px] mb-[2px]">
      {Array.from({ length: of }).map((_, i) => (
        <div
          key={i}
          data-auth-step=""
          className={`h-1 w-[22px] rounded-r-1 ${i < n ? "bg-arcan-accent" : "bg-panel-2"}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

/**
 * AuthTitle: centered title text styled per design's `Title` (lines 35-37).
 * 19px / 700 / line-height 1.25 / -.01em tracking when mono.
 */
export function AuthTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-center text-text font-mono font-bold leading-tight"
      style={{ fontSize: 19, letterSpacing: "-0.01em" }}>
      {children}
    </div>
  );
}

/**
 * AuthSub: centered subtitle text styled per design's `Sub` (lines 38-40).
 * 11.5px / 400 / line-height 1.5 / negative top margin to tuck under title.
 */
export function AuthSub({ children }: { children: ReactNode }) {
  return (
    <div className="text-center text-text-2 -mt-2" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Run tests — verify all pass**

Run: `npx vitest run tests/unit/components/auth-surface.test.tsx`

Expected: PASS — 9 tests pass.

- [ ] **Step 3: Run check-tokens + tsc**

```bash
npm run check-tokens
npx tsc -b --noEmit
```

Expected: both exit 0. If `check-tokens` flags any class, it should not — we used only token-prefixed utilities (`bg-bg`, `bg-arcan-accent`, `bg-panel-2`, `text-text`, `text-text-2`, `border-hairline`, `font-mono`, `rounded-r-1`). Fix any violation before commit.

- [ ] **Step 4: Commit**

```bash
git add src/components/auth-surface.tsx tests/unit/components/auth-surface.test.tsx
git commit -m "feat(unit-8a): add AuthSurface + Wordmark + Steps primitives"
```

---

## Phase 2 · Adopt `<AuthSurface>` in auth routes (AUDIT-001..004)

Each auth route swaps its `min-h-screen flex bg-background` outer div for `<AuthSurface forceDark>` and gains a `<Wordmark>`. Typography goes lowercase. Token classes replace shadcn HSL classes.

### Task 2.1: `/auth/login` (AUDIT-001, AUDIT-002)

**Files:**
- Modify: `src/routes/auth/login.tsx`

- [ ] **Step 1: Rewrite the route to use AuthSurface**

Replace the entire `return ( ... )` block with:

```tsx
  return (
    <AuthSurface forceDark>
      <Wordmark size={22} />
      <AuthTitle>sign in</AuthTitle>
      <form className="flex flex-col gap-[15px]" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-[6px]">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            email
          </span>
          <input
            type="email"
            data-testid="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="you@domain.dev"
            className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-text placeholder:text-dim text-[12px] focus:outline-none focus:border-arcan-accent"
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            password
          </span>
          <input
            type="password"
            data-testid="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-text placeholder:text-dim text-[12px] focus:outline-none focus:border-arcan-accent"
          />
        </label>

        {error && (
          <p
            data-testid="login-error"
            className="rounded-r-3 bg-red/10 px-3 py-2 text-[12px] text-red"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          data-testid="login-submit"
          className="h-10 w-full rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
        >
          {isLoading ? "signing in…" : "sign in"}
        </button>

        <div className="flex justify-between text-[10.5px]">
          <Link to="/auth/recovery" className="text-dim hover:text-text">
            forgot password?
          </Link>
          <Link to="/onboarding" className="text-arcan-accent hover:text-text">
            create account
          </Link>
        </div>
      </form>
    </AuthSurface>
  );
```

Add to imports at top of file:

```tsx
import { AuthSurface, Wordmark, AuthTitle } from "@/components/auth-surface";
```

Remove the now-unused `Button` import. Keep the `signIn`, `useSignInToJazzWithSeed`, `Link`, `useNavigate`, and `useState` / `FormEvent` imports.

- [ ] **Step 2: Verify check-tokens + tsc**

```bash
npm run check-tokens
npx tsc -b --noEmit
```

Expected: both exit 0.

- [ ] **Step 3: Run any existing auth route tests**

```bash
npx vitest run tests/unit/routes/ tests/unit/auth/
```

Expected: PASS (or no tests under those paths — both acceptable). The route is presentational; we keep all `data-testid` attributes for Phase C e2e compat.

- [ ] **Step 4: Commit**

```bash
git add src/routes/auth/login.tsx
git commit -m "feat(unit-8a): adopt AuthSurface on /auth/login (AUDIT-001, AUDIT-002)"
```

### Task 2.2: `/auth/recovery` (AUDIT-003, AUDIT-004)

**Files:**
- Modify: `src/routes/auth/recovery.tsx`

The recovery route has two stages: `StageCode` (paste 24-word code) and `StageNewPassword` (set password after recovery). Both wrap in `<AuthSurface forceDark>`. `StageCode` uses `tall` because the textarea + back link benefit from top-aligned layout that scales with viewport.

- [ ] **Step 1: Rewrite the outer route**

Replace the `RecoveryRoute` return with:

```tsx
  return (
    <>
      {stage.kind === "enter-code" ? (
        <StageCode error={error} onSubmit={handleEnterCode} />
      ) : (
        <StageNewPassword
          error={error}
          setError={setError}
          onSubmit={handleSetNewPassword}
          onSkip={() => navigate("/", { replace: true })}
        />
      )}
    </>
  );
```

(Drops the outer `<div className="flex min-h-screen items-center justify-center bg-background px-4">` — the inner stages now own their full-bleed surface.)

- [ ] **Step 2: Rewrite `StageCode`**

```tsx
function StageCode({ error, onSubmit }: StageCodeProps) {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSubmit(code);
    } catch {
      // Parent's setError already populated.
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthSurface forceDark w={368} tall>
      <Wordmark size={20} />
      <AuthTitle>recover account</AuthTitle>
      <AuthSub>enter your 24-word recovery code</AuthSub>
      <form className="flex flex-col gap-[15px]" onSubmit={handleSubmit}>
        <textarea
          data-testid="recovery-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={4}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          placeholder="word1 word2 word3 … word24"
          className="w-full rounded-r-3 border border-hairline bg-panel px-3 py-2 font-mono text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
        />
        {error && (
          <p
            data-testid="recovery-error"
            className="rounded-r-3 bg-red/10 px-3 py-2 text-[12px] text-red"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={isLoading}
          data-testid="recovery-submit"
          className="h-10 w-full rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
        >
          {isLoading ? "recovering…" : "recover"}
        </button>
        <Link
          to="/auth/login"
          className="block text-center text-[10.5px] text-dim hover:text-text"
        >
          back to sign in
        </Link>
      </form>
    </AuthSurface>
  );
}
```

- [ ] **Step 3: Rewrite `StageNewPassword`**

```tsx
function StageNewPassword({
  error,
  setError,
  onSubmit,
  onSkip,
}: StageNewPasswordProps) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 12) {
      setError("password must be at least 12 characters");
      return;
    }
    if (pw !== pw2) {
      setError("passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      await onSubmit(pw);
    } catch {
      // Parent setError already populated.
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthSurface forceDark>
      <Wordmark size={20} />
      <AuthTitle>set a new password</AuthTitle>
      <AuthSub>you're signed in. choose a password for next time.</AuthSub>
      <form className="flex flex-col gap-[15px]" onSubmit={handleSubmit}>
        <input
          type="password"
          data-testid="recovery-new-password"
          placeholder="new password (≥12 chars)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
          className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
        />
        <input
          type="password"
          data-testid="recovery-new-password-confirm"
          placeholder="confirm new password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password"
          className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
        />
        {error && (
          <p className="rounded-r-3 bg-red/10 px-3 py-2 text-[12px] text-red">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="h-10 flex-1 rounded-r-3 border border-hairline bg-transparent font-mono text-[12.5px] font-semibold text-text"
          >
            skip for now
          </button>
          <button
            type="submit"
            disabled={isLoading}
            data-testid="recovery-set-password"
            className="h-10 flex-1 rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
          >
            {isLoading ? "saving…" : "save password"}
          </button>
        </div>
      </form>
    </AuthSurface>
  );
}
```

- [ ] **Step 4: Update imports**

At the top of `src/routes/auth/recovery.tsx`, replace the `Button` import:

```tsx
// Remove:
// import { Button } from "@/components/ui/button";
// Add:
import { AuthSurface, Wordmark, AuthTitle, AuthSub } from "@/components/auth-surface";
```

- [ ] **Step 5: Verify**

```bash
npm run check-tokens
npx tsc -b --noEmit
npx vitest run
```

Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/routes/auth/recovery.tsx
git commit -m "feat(unit-8a): adopt AuthSurface on /auth/recovery (AUDIT-003, AUDIT-004)"
```

---

## Phase 3 · Adopt in onboarding routes (AUDIT-005, AUDIT-006)

Five onboarding step components + the two restore steps. Welcome opens with a hero `<Wordmark size={30} />`; non-welcome steps open with `<Steps n={N} />`. Subtitle on welcome replaced by short copy. Restore choice / restore-with-code also use AuthSurface — they share the "this is the auth flow" identity.

### Task 3.1: `welcome-step.tsx`

**Files:**
- Modify: `src/routes/onboarding/welcome-step.tsx`

- [ ] **Step 1: Rewrite**

```tsx
import { useNavigate } from "react-router-dom";
import { AuthSurface, Wordmark, AuthSub } from "@/components/auth-surface";

interface WelcomeStepProps {
  onCreateAccount: () => void;
  onRestoreAccount: () => void;
}

/**
 * WelcomeStep: first screen in the onboarding flow.
 *
 * Hero Wordmark + concise "local-first · end-to-end encrypted" tagline.
 * Primary CTA = create account; secondary = restore from recovery code;
 * sign-in CTA tucked beneath as a MuteLink-style row.
 *
 * Audit ref: AUDIT-005, AUDIT-006, headline observations #6 and #7.
 */
export function WelcomeStep({
  onCreateAccount,
  onRestoreAccount,
}: WelcomeStepProps) {
  const navigate = useNavigate();
  return (
    <AuthSurface forceDark w={300}>
      <Wordmark size={30} />
      <AuthSub>local-first · end-to-end encrypted</AuthSub>
      <div className="h-[6px]" />
      <button
        type="button"
        data-testid="create-account-btn"
        onClick={onCreateAccount}
        className="h-10 w-full rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold"
      >
        create account
      </button>
      <button
        type="button"
        data-testid="restore-account-btn"
        onClick={onRestoreAccount}
        className="h-10 w-full rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
      >
        restore from recovery code
      </button>
      <div className="text-center mt-[2px] text-[10.5px]">
        <span className="text-dim">already on a device? </span>
        <button
          type="button"
          data-testid="welcome-signin-link"
          onClick={() => navigate("/auth/login")}
          className="text-arcan-accent hover:text-text"
        >
          sign in
        </button>
      </div>
    </AuthSurface>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm run check-tokens
npx tsc -b --noEmit
```

Expected: both 0.

- [ ] **Step 3: Commit**

```bash
git add src/routes/onboarding/welcome-step.tsx
git commit -m "feat(unit-8a): adopt AuthSurface on onboarding welcome (AUDIT-005, AUDIT-006 + headline #6/#7)"
```

### Task 3.2: `credentials-step.tsx` (step 1 of 4)

**Files:**
- Modify: `src/routes/onboarding/credentials-step.tsx`

- [ ] **Step 1: Replace the outer wrapper + add Steps + lowercase**

In the imports, replace `Button` with the AuthSurface primitives:

```tsx
import { useState, type FormEvent } from "react";
import { AuthSurface, Steps, AuthTitle } from "@/components/auth-surface";
```

Replace the `return ( ... )` block with:

```tsx
  return (
    <AuthSurface forceDark>
      <Steps n={1} />
      <AuthTitle>create your account</AuthTitle>
      <form
        className="flex flex-col gap-[15px]"
        onSubmit={handleSubmit}
        data-testid="credentials-form"
      >
        <label className="flex flex-col gap-[6px]">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            email
          </span>
          <input
            type="email"
            data-testid="credentials-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="you@domain.dev"
            className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            password
          </span>
          <input
            type="password"
            data-testid="credentials-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LEN}
            placeholder="choose a strong password"
            className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            confirm password
          </span>
          <input
            type="password"
            data-testid="credentials-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            placeholder="••••••••"
            className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
          />
        </label>

        {error && (
          <p
            data-testid="credentials-error"
            className="rounded-r-3 bg-red/10 px-3 py-2 text-[12px] text-red"
          >
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="h-10 flex-1 rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
          >
            back
          </button>
          <button
            type="submit"
            data-testid="credentials-continue"
            className="h-10 flex-1 rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold"
          >
            continue →
          </button>
        </div>
        <div className="text-center text-[10.5px] text-dim">step 1 of 4</div>
      </form>
    </AuthSurface>
  );
```

- [ ] **Step 2: Verify + commit**

```bash
npm run check-tokens
npx tsc -b --noEmit
git add src/routes/onboarding/credentials-step.tsx
git commit -m "feat(unit-8a): adopt AuthSurface on onboarding credentials (step 1 of 4)"
```

### Task 3.3: `backup-display-step.tsx` (step 2 of 4)

**Files:**
- Modify: `src/routes/onboarding/backup-display-step.tsx`

This step uses `tall` because the 24-word grid is dense and benefits from a top-aligned scrolling column.

- [ ] **Step 1: Replace imports**

```tsx
import { useState } from "react";
import { AuthSurface, Steps, AuthTitle } from "@/components/auth-surface";
```

(Drop `Button`.)

- [ ] **Step 2: Replace the return block**

```tsx
  return (
    <AuthSurface forceDark w={368} tall>
      <Steps n={2} />
      <AuthTitle>save your recovery code</AuthTitle>

      {/* Warning callout — same warn-amber palette as the design's
          recovery scene (hf-flows.jsx lines 108-118). */}
      <div className="flex items-start gap-2 rounded-r-3 border border-amber/40 bg-amber/10 px-3 py-[9px]">
        <span className="font-mono text-[12px] font-semibold text-amber leading-snug">⚠</span>
        <span className="text-[10.5px] leading-relaxed text-amber">
          this 24-word code is the only way to recover your account. nox cannot reset it.
        </span>
      </div>

      {/* 3-column word grid */}
      <div
        data-testid="passphrase-grid"
        className="grid grid-cols-3 gap-x-[10px] gap-y-[6px] rounded-r-3 border border-hairline bg-panel p-[13px]"
      >
        {words.map((word, i) => (
          <div key={i} className="flex gap-[6px]">
            <span className="w-[13px] font-mono text-[9px] text-dim leading-snug">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-mono text-[10.5px] text-text leading-snug">
              {word}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        data-testid="passphrase-copy-btn"
        onClick={handleCopy}
        aria-live="polite"
        className="h-10 w-full rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
      >
        {copyLabel}
      </button>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          data-testid="passphrase-saved-checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-[2px] h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
        />
        <span className="text-[11px] text-text-2 leading-relaxed">
          i have saved my recovery code in a secure location and understand it cannot be recovered if lost.
        </span>
      </label>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-10 flex-1 rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
        >
          back
        </button>
        <button
          type="button"
          data-testid="passphrase-display-continue"
          disabled={!acknowledged}
          onClick={onContinue}
          className="h-10 flex-1 rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
        >
          i've saved it →
        </button>
      </div>
      <div className="text-center text-[10.5px] text-dim">step 2 of 4</div>
    </AuthSurface>
  );
```

Lowercase the copy strings (`Copied to clipboard` → `copied to clipboard`, etc.) inside `copyLabel`:

```tsx
  const copyLabel =
    copyState === "copied"
      ? "copied to clipboard"
      : copyState === "error"
        ? "copy failed — copy manually"
        : "copy recovery code";
```

- [ ] **Step 3: Verify + commit**

```bash
npm run check-tokens
npx tsc -b --noEmit
git add src/routes/onboarding/backup-display-step.tsx
git commit -m "feat(unit-8a): adopt AuthSurface on onboarding backup-display (step 2 of 4)"
```

### Task 3.4: `backup-confirm-step.tsx` (step 3 of 4)

**Files:**
- Modify: `src/routes/onboarding/backup-confirm-step.tsx`

- [ ] **Step 1: Replace imports + return block**

Imports:

```tsx
import { useMemo, useState } from "react";
import { AuthSurface, Steps, AuthTitle, AuthSub } from "@/components/auth-surface";
```

Return block (the design challenges two words; the live component challenges three, which we keep to preserve test compat — only the surface and styling change):

```tsx
  return (
    <AuthSurface forceDark>
      <Steps n={3} />
      <AuthTitle>confirm your code</AuthTitle>
      <AuthSub>type the words shown to prove you saved it</AuthSub>

      <div className="flex flex-col gap-3">
        {challengeIndices.map((wordIdx, slot) => (
          <label key={slot} className="flex flex-col gap-[6px]">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
              word #{String(wordIdx + 1).padStart(2, "0")}
            </span>
            <input
              id={`confirm-word-${slot}`}
              data-testid={`confirm-word-${slot}`}
              type="text"
              value={inputs[slot]}
              onChange={(e) => setInput(slot, e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={`type word ${wordIdx + 1}`}
              className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 font-mono text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
            />
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-10 flex-1 rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
        >
          back
        </button>
        <button
          type="button"
          data-testid="confirm-passphrase-btn"
          disabled={!allCorrect}
          onClick={onConfirmed}
          className="h-10 flex-1 rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
        >
          continue →
        </button>
      </div>
      <div className="text-center text-[10.5px] text-dim">step 3 of 4</div>
    </AuthSurface>
  );
```

- [ ] **Step 2: Verify + commit**

```bash
npm run check-tokens
npx tsc -b --noEmit
git add src/routes/onboarding/backup-confirm-step.tsx
git commit -m "feat(unit-8a): adopt AuthSurface on onboarding backup-confirm (step 3 of 4)"
```

### Task 3.5: `profile-step.tsx` (step 4 of 4)

**Files:**
- Modify: `src/routes/onboarding/profile-step.tsx`

- [ ] **Step 1: Replace imports**

```tsx
import { useState } from "react";
import { signUp } from "@/auth/flows";
import { decodeRecoveryCode } from "@/auth/recovery-code";
import {
  useCreateAccountWithSeed,
  useSetDisplayNameOnMe,
} from "@/jazz/createAccountFromSeed";
import { AuthSurface, Steps, AuthTitle } from "@/components/auth-surface";
import type { Credentials } from "./credentials-step";
```

- [ ] **Step 2: Replace the return block**

```tsx
  return (
    <AuthSurface forceDark>
      <Steps n={4} />
      <AuthTitle>set up your profile</AuthTitle>

      {/* Avatar placeholder + camera overlay — purely decorative on this step;
          actual avatar upload happens in /profile after sign-up completes. */}
      <div className="flex justify-center mt-[2px]">
        <div className="relative">
          <div className="flex h-[78px] w-[78px] items-center justify-center rounded-r-3 border border-hairline bg-accent-soft font-mono text-[26px] font-semibold text-arcan-accent">
            ?
          </div>
          <div className="absolute -bottom-[2px] -right-[2px] flex h-7 w-7 items-center justify-center rounded-pill border-2 border-bg bg-arcan-accent text-on-accent text-[14px]">
            ●
          </div>
        </div>
      </div>

      <label className="flex flex-col gap-[6px]">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
          display name
        </span>
        <input
          id="display-name-input"
          data-testid="display-name-input"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleFinish();
          }}
          placeholder="how others see you"
          autoFocus
          className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
        />
      </label>

      {error && (
        <p
          data-testid="profile-error"
          className="rounded-r-3 bg-red/10 px-3 py-2 text-[12px] text-red"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="h-10 flex-1 rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold disabled:opacity-50"
        >
          back
        </button>
        <button
          type="button"
          data-testid="finish-onboarding-btn"
          disabled={!canSubmit}
          onClick={() => void handleFinish()}
          className="h-10 flex-1 rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
        >
          {isSubmitting ? "creating account…" : "enter arcan →"}
        </button>
      </div>
      <div className="text-center text-[10.5px] text-dim">step 4 of 4</div>
    </AuthSurface>
  );
```

- [ ] **Step 3: Verify + commit**

```bash
npm run check-tokens
npx tsc -b --noEmit
git add src/routes/onboarding/profile-step.tsx
git commit -m "feat(unit-8a): adopt AuthSurface on onboarding profile (step 4 of 4)"
```

### Task 3.6: `restore-choice-step.tsx` + `restore-with-code-step.tsx`

These two are part of the onboarding entry — they share the auth-flow identity. No Steps indicator (they're outside the 4-step funnel).

**Files:**
- Modify: `src/routes/onboarding/restore-choice-step.tsx`
- Modify: `src/routes/onboarding/restore-with-code-step.tsx`

- [ ] **Step 1: Rewrite `restore-choice-step.tsx`**

```tsx
import { AuthSurface, Wordmark, AuthTitle, AuthSub } from "@/components/auth-surface";

interface RestoreChoiceStepProps {
  onBack: () => void;
  onSignInWithPassword: () => void;
  onRestoreWithCode: () => void;
}

/**
 * RestoreChoiceStep: lets the user pick between the two sign-in paths.
 * Path A: email + password (the common case).
 * Path B: 24-word recovery code (forgot-password escape hatch).
 */
export function RestoreChoiceStep({
  onBack,
  onSignInWithPassword,
  onRestoreWithCode,
}: RestoreChoiceStepProps) {
  return (
    <AuthSurface forceDark>
      <Wordmark size={22} />
      <AuthTitle>restore your account</AuthTitle>
      <AuthSub>how would you like to sign in?</AuthSub>

      <button
        type="button"
        data-testid="restore-choice-signin"
        onClick={onSignInWithPassword}
        className="h-10 w-full rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold"
      >
        sign in with email & password
      </button>
      <button
        type="button"
        data-testid="restore-choice-code"
        onClick={onRestoreWithCode}
        className="h-10 w-full rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
      >
        use 24-word recovery code
      </button>
      <button
        type="button"
        onClick={onBack}
        className="h-10 w-full bg-transparent text-text-2 font-mono text-[12.5px] font-semibold"
      >
        back
      </button>
    </AuthSurface>
  );
}
```

- [ ] **Step 2: Rewrite `restore-with-code-step.tsx`**

Keep all logic (`handleRestore`, validatePassphrase, etc.); replace only the return block + outer imports.

Imports (replace `Button`):

```tsx
import { AuthSurface, Wordmark, AuthTitle, AuthSub } from "@/components/auth-surface";
```

Return block:

```tsx
  return (
    <AuthSurface forceDark w={376} tall>
      <Wordmark size={20} />
      <AuthTitle>restore your account</AuthTitle>
      <AuthSub>paste your 24-word code, or type each word</AuthSub>

      <div className="flex flex-col gap-[15px]">
        <label className="flex flex-col gap-[6px]">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            recovery code
          </span>
          <textarea
            id="restore-passphrase-input"
            data-testid="restore-passphrase-input"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            rows={4}
            placeholder="word1 word2 word3 … word24"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-r-3 border border-hairline bg-panel px-3 py-2 font-mono text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
          />
        </label>

        {error && (
          <p
            data-testid="restore-error"
            className="rounded-r-3 bg-red/10 px-3 py-2 text-[12px] text-red"
          >
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={isRestoring}
            className="h-10 flex-1 rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold disabled:opacity-50"
          >
            back
          </button>
          <button
            type="button"
            data-testid="restore-btn"
            disabled={!canSubmit}
            onClick={() => void handleRestore()}
            className="h-10 flex-1 rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
          >
            {isRestoring ? "restoring…" : "restore →"}
          </button>
        </div>
        <div className="text-center text-[10.5px] text-dim">
          keys live on your device — no server reset
        </div>
      </div>
    </AuthSurface>
  );
```

Lowercase the validation reason strings inline:

```tsx
      const reasons: Record<typeof validation.reason, string> = {
        "invalid-length":
          "the recovery code must be exactly 24 words. please check your input.",
        "invalid-word":
          "one or more words are not in the BIP-39 word list. check for typos.",
        "invalid-checksum":
          "the recovery code checksum is invalid. please check all 24 words carefully.",
      };
```

- [ ] **Step 3: Verify + commit**

```bash
npm run check-tokens
npx tsc -b --noEmit
npx vitest run
git add src/routes/onboarding/restore-choice-step.tsx src/routes/onboarding/restore-with-code-step.tsx
git commit -m "feat(unit-8a): adopt AuthSurface on onboarding restore-choice + restore-with-code"
```

---

## Phase 4 · Adopt in pair routes (AUDIT-039..042)

The pair flow has an outer `PairRoute` wrapper at `src/routes/pair/index.tsx` that currently renders a Card with a header. We **drop** the Card wrapper entirely — the inner steps now own their AuthSurface. This means `initiator-step.tsx` and `responder-step.tsx` get full-bleed treatment.

### Task 4.1: `src/routes/pair/index.tsx` — drop the Card wrapper

**Files:**
- Modify: `src/routes/pair/index.tsx`

- [ ] **Step 1: Replace the entire file content**

```tsx
/**
 * PairRoute: handles /pair — chooses between initiator and responder flow
 * based on the `?role=` query parameter.
 *
 * - `?role=initiator` → InitiatorStep
 * - anything else (including no role param, or URL hash present) → ResponderStep
 *
 * The inner steps own their AuthSurface; this route is a thin selector.
 *
 * This route is auth-OPTIONAL: the responder arrives as an unauthenticated
 * user (or guest) and becomes authenticated after claiming the account.
 * App.tsx adds a special case before the auth gate to allow this route.
 */

import { InitiatorStep } from "./initiator-step";
import { ResponderStep } from "./responder-step";

export function PairRoute() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get("role");
  return role === "initiator" ? <InitiatorStep /> : <ResponderStep />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/pair/index.tsx
git commit -m "refactor(unit-8a): drop Card wrapper from PairRoute (AUDIT-039..042 prep)"
```

### Task 4.2: `initiator-step.tsx` — adopt AuthSurface (AUDIT-039, AUDIT-040)

**Files:**
- Modify: `src/routes/pair/initiator-step.tsx`

The initiator has six render branches: `loading`, `error`, `complete`, `approved`, `awaiting-approval`, `waiting`. Each gets wrapped in `<AuthSurface forceDark w={330}>` with a `<Wordmark size={20} />` at the top and a lowercase title via `<AuthTitle>`. The `DeviceApprovalCard` and `QRDisplay` keep their existing internals.

- [ ] **Step 1: Update imports**

At the top, replace the `Button` + `Link` imports with the AuthSurface primitives:

```tsx
import { Link } from "react-router-dom";
import { AuthSurface, Wordmark, AuthTitle, AuthSub } from "@/components/auth-surface";
```

(Keep `Button` import — we still use it for `Retry` in the error branch. Or convert that button to a plain `<button>` with surface styling; either works. The minimal change keeps `Button`.)

- [ ] **Step 2: Rewrite each render branch**

Replace each phase return block:

```tsx
  if (phase === "loading") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>preparing link</AuthTitle>
        <AuthSub>creating pairing session…</AuthSub>
      </AuthSurface>
    );
  }

  if (phase === "error") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>something went wrong</AuthTitle>
        <AuthSub>{errorMsg ?? "unknown error"}</AuthSub>
        <div data-testid="pair-init-error" />
        <button
          type="button"
          onClick={() => {
            setPhase("loading");
            setInvitation(null);
            setErrorMsg(null);
          }}
          className="h-10 w-full rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
        >
          retry
        </button>
      </AuthSurface>
    );
  }

  if (phase === "complete") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>new device linked</AuthTitle>
        <div data-testid="pair-init-complete" />
        <Link to="/">
          <button
            type="button"
            data-testid="pair-init-home-btn"
            className="h-10 w-full rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold"
          >
            back to home
          </button>
        </Link>
      </AuthSurface>
    );
  }

  if (phase === "approved") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>linking device</AuthTitle>
        <AuthSub>transferring account secret…</AuthSub>
        <div data-testid="pair-approved" />
      </AuthSurface>
    );
  }

  if (phase === "awaiting-approval") {
    const p = invitation?.pairing as any;
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <div data-testid="pair-approval-prompt">
          <DeviceApprovalCard
            userAgent={p?.responderUserAgent}
            firstSeenAt={p?.responderFirstSeenAt}
            fingerprint={p?.responderFingerprint}
            onApprove={handleApprove}
            onDeny={handleReject}
            pending={false}
          />
        </div>
      </AuthSurface>
    );
  }

  // phase === "waiting"
  return (
    <AuthSurface forceDark w={330}>
      <Wordmark size={20} />
      <AuthTitle>link a new device</AuthTitle>
      <AuthSub>open this link on your other device, or scan it</AuthSub>
      <div className="flex justify-center" data-testid="pair-waiting">
        {invitation && <QRDisplay url={invitation.url} size={132} showText={false} />}
      </div>
      <button
        type="button"
        onClick={handleCopyUrl}
        data-testid="pair-copy-url-btn"
        className="h-10 w-full rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
      >
        {copyFeedback ? "copied!" : "copy link"}
      </button>
      <div className="flex items-center justify-center gap-2 mt-[2px]">
        <span className="h-[7px] w-[7px] rounded-pill bg-arcan-accent" />
        <span className="text-[10.5px] text-dim">waiting for your other device…</span>
      </div>
    </AuthSurface>
  );
```

(The `Button` import can now be removed if the only remaining `Button` usages are gone; verify with `grep -n "Button" src/routes/pair/initiator-step.tsx` and prune the import if zero hits remain.)

- [ ] **Step 3: Verify + commit**

```bash
npm run check-tokens
npx tsc -b --noEmit
git add src/routes/pair/initiator-step.tsx
git commit -m "feat(unit-8a): adopt AuthSurface on /pair?role=initiator (AUDIT-039, AUDIT-040)"
```

### Task 4.3: `responder-step.tsx` — adopt AuthSurface (AUDIT-041, AUDIT-042)

**Files:**
- Modify: `src/routes/pair/responder-step.tsx`

The responder has seven render branches: `scanning`, `loaded`, `waiting-approval`, `rejected`, `timed-out`, `claiming`, `complete`, `error`. Each gets the same AuthSurface treatment.

- [ ] **Step 1: Update imports**

```tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useJazzContextValue, useAuthSecretStorage } from "jazz-tools/react";
import { QRScanner } from "@/qr/scanner";
import { AuthSurface, Wordmark, AuthTitle, AuthSub } from "@/components/auth-surface";
import {
  parsePairingURL,
  loadPairingAsAgent,
  respondToPairing,
  claimAccountFromPairing,
  nextPairingPhase,
} from "@/jazz/pairing";
import type { PairingAuthContext } from "@/jazz/pairing";
import type { AgentSecret } from "cojson";
import type { Account, ID } from "jazz-tools";
```

(Drop the existing `Button` and `Lattice` imports — `<AuthSurface>` brings the watermark.)

- [ ] **Step 2: Rewrite each render branch**

Replace each:

```tsx
  if (phase === "scanning") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>scan to join</AuthTitle>
        <AuthSub>point your camera at the QR on your other device</AuthSub>
        <QRScanner onUrl={handleScanned} expectedPathPrefix="/pair" />
      </AuthSurface>
    );
  }

  if (phase === "loaded") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>reading pairing link</AuthTitle>
        <AuthSub>verifying the invite…</AuthSub>
      </AuthSurface>
    );
  }

  if (phase === "waiting-approval") {
    const fp = (pairing as any)?.responderFingerprint as string | undefined;
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>waiting for approval</AuthTitle>
        <AuthSub>on your other device, approve this link</AuthSub>
        <div
          data-testid="pair-resp-waiting"
          className="flex flex-col items-center gap-[6px]"
        >
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            fingerprint
          </span>
          <span
            data-testid="responder-fingerprint"
            className="rounded-r-3 border border-hairline bg-panel px-4 py-2 font-mono text-[22px] tracking-widest text-text"
          >
            {fp ?? "…"}
          </span>
          <p className="text-[11px] text-dim leading-relaxed text-center">
            match this code with what's shown on your other device before tapping approve there.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className="h-[7px] w-[7px] rounded-pill bg-arcan-accent" />
          <span className="text-[10.5px] text-dim">waiting…</span>
        </div>
      </AuthSurface>
    );
  }

  if (phase === "rejected") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>request rejected</AuthTitle>
        <AuthSub>the other device declined this link. ask them to retry, or start over.</AuthSub>
        <div data-testid="pair-resp-rejected" />
      </AuthSurface>
    );
  }

  if (phase === "timed-out") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>request timed out</AuthTitle>
        <AuthSub>start a new pairing on your other device.</AuthSub>
        <div data-testid="pair-resp-timed-out" />
      </AuthSurface>
    );
  }

  if (phase === "claiming") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>claiming account</AuthTitle>
        <AuthSub>almost there…</AuthSub>
        <div data-testid="pair-resp-claiming" />
      </AuthSurface>
    );
  }

  if (phase === "complete") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>account paired</AuthTitle>
        <AuthSub>you now have access on this device.</AuthSub>
        <button
          type="button"
          onClick={() => { window.location.href = "/"; }}
          data-testid="pair-resp-complete"
          className="h-10 w-full rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold"
        >
          continue
        </button>
      </AuthSurface>
    );
  }

  if (phase === "error") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>pairing failed</AuthTitle>
        <AuthSub>{errorMsg ?? "unknown error"}</AuthSub>
        <button
          type="button"
          onClick={() => {
            setPhase("scanning");
            setPairingUrl(null);
            setErrorMsg(null);
          }}
          data-testid="pair-resp-error"
          className="h-10 w-full rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
        >
          try again
        </button>
      </AuthSurface>
    );
  }

  return null;
```

- [ ] **Step 3: Verify + commit**

```bash
npm run check-tokens
npx tsc -b --noEmit
git add src/routes/pair/responder-step.tsx
git commit -m "feat(unit-8a): adopt AuthSurface on /pair responder (AUDIT-041, AUDIT-042)"
```

---

## Phase 5 · Adopt in `<ProfileView>` (AUDIT-025..028)

`<ProfileView>` is the Unit 4 polymorphic profile component rendered at `/profile/:accountID`. It needs the cosmic backdrop. Unlike auth flows, the profile is **authenticated** — we keep `forceDark` because the audit-headline-#1 fix says the auth-adjacent cosmic surfaces are dark by design (and profile reuses AuthSurface as the cosmic backdrop). The cards/buttons inside remain unchanged structurally; we only swap the outer wrapper.

### Task 5.1: `profile-view.tsx` — wrap in AuthSurface

**Files:**
- Modify: `src/components/profile-view.tsx`

- [ ] **Step 1: Update imports**

At the top, add:

```tsx
import { AuthSurface } from "@/components/auth-surface";
```

- [ ] **Step 2: Wrap the rendered output in AuthSurface**

Replace:

```tsx
  return (
    <div
      data-testid="profile-view"
      data-profile-mode={isOwn ? "own" : "other"}
      className="flex flex-col items-center gap-4 p-6 max-w-md mx-auto"
    >
```

with:

```tsx
  return (
    <AuthSurface forceDark w={420} tall>
      <div
        data-testid="profile-view"
        data-profile-mode={isOwn ? "own" : "other"}
        className="flex flex-col items-center gap-4"
      >
```

And replace the closing `</div>` at the end of the JSX tree (just before the outer `)`) with:

```tsx
      </div>
    </AuthSurface>
```

Also wrap the early-return loading branch:

```tsx
  if (!me.$isLoaded) {
    return (
      <AuthSurface forceDark>
        <div className="flex flex-col items-center gap-4" data-testid="profile-loading">
          <p className="text-sm text-dim">loading…</p>
        </div>
      </AuthSurface>
    );
  }
```

(Lowercase the "Loading…" copy too.)

- [ ] **Step 3: Lowercase the user-facing strings inside ProfileView**

Inside the rendered output, lowercase the following strings (find-replace within this file only):
- `← Back` → `← back`
- `Remove profile picture` → `remove profile picture`
- `account & settings` — already lowercase, keep.
- The avatar `confirm()` text `"Remove your profile picture?"` → `"remove your profile picture?"`
- `"shared conversations"` / `"your conversations"` — already lowercase, keep.
- `Unknown` (fallback display name) → `unknown`
- Avatar error message `"Upload failed — try again."` → `"upload failed — try again."`

- [ ] **Step 4: Verify**

```bash
npm run check-tokens
npx tsc -b --noEmit
npx vitest run tests/unit/components/profile-view.test.tsx
```

Expected: token check + tsc pass. The profile-view test may need a trivial update if it asserted on the old "← Back" string — if so, update the test assertion to match the lowercase string in the same commit. Run `git diff tests/unit/components/profile-view.test.tsx` to confirm whether any test change is required.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile-view.tsx tests/unit/components/profile-view.test.tsx
git commit -m "feat(unit-8a): adopt AuthSurface on ProfileView (AUDIT-025..028)"
```

If the test file wasn't modified, drop it from `git add` — the commit only includes `profile-view.tsx`.

---

## Phase 6 · Final verification + spot-check

### Task 6.1: Full check suite

- [ ] **Step 1: Run all gates**

```bash
npm run check-tokens
npx tsc -b --noEmit
npx vitest run
```

Expected: all exit 0. If any fail, fix in a new task before proceeding.

### Task 6.2: Spot-check via live dev server

This step requires the `nix-shell` env (the project CLAUDE.md indicates dev requires it).

- [ ] **Step 1: Start dev + sync**

```bash
# In the nix-shell environment:
npm run dev:all
```

- [ ] **Step 2: Visit each of the nine routes and confirm cosmic backdrop**

| Route | Expected |
|---|---|
| `/auth/login` | Cosmic dark backdrop, Lattice watermark bottom-right, 4 stars, Wordmark above "sign in" title, lowercase form labels. |
| `/auth/recovery` | Same backdrop; stage-code shows 24-word textarea with "recover account" lowercase title. |
| `/onboarding` (welcome) | Hero Wordmark (size 30), "local-first · end-to-end encrypted" tagline, "create account" / "restore from recovery code" / "already on a device? sign in". |
| `/onboarding` → credentials | Steps row (1 of 4 filled), "create your account" lowercase title, uppercase-tracking field labels. |
| `/onboarding` → backup-display | Steps row (2 of 4), 24-word grid in panel border, amber warning callout, "i've saved it →" CTA. |
| `/onboarding` → backup-confirm | Steps row (3 of 4), word-position-labelled challenge inputs. |
| `/onboarding` → profile | Steps row (4 of 4), avatar placeholder + camera dot, "enter arcan →" CTA. |
| `/pair?role=initiator` | Cosmic backdrop, "link a new device" title, QR centered in narrow column, copy-link button. |
| `/pair` (responder) | Cosmic backdrop, "scan to join" title, QR scanner inside the narrow column. |
| `/profile/:accountID` | Cosmic backdrop with the existing profile body inside; lowercase back link and copy. |

- [ ] **Step 3: Confirm force-dark works regardless of system preference**

Open devtools, set `prefers-color-scheme: light` via the Emulation tab → Rendering → "Emulate CSS media feature prefers-color-scheme: light". Visit `/auth/login`. The surface must stay dark.

Reset the rendering override after spot-check.

- [ ] **Step 4: Confirm `<html data-theme>` restoration on navigation away**

While on `/auth/login` with system pref = light, inspect `<html>` — should read `data-theme="dark"`. Navigate to a non-auth route (after signing in is heavy; alternative is to mount a non-AuthSurface route briefly via the router). Confirm `data-theme` reverts.

Note: this test only matters if you mounted AuthSurface from a previously-light state. If `<html>` had no `data-theme` set, AuthSurface should set it on mount and remove it on unmount.

### Task 6.3: Open a PR

- [ ] **Step 1: Push branch + open PR**

```bash
git push -u origin unit-8a-auth-surface
gh pr create --title "Unit 8a: AuthSurface primitive + adopt in 9 routes" --body "$(cat <<'EOF'
## Summary

- New shared cosmic `<AuthSurface>` primitive (Lattice watermark + 4 stars + centered card column) in `src/components/auth-surface.tsx`, with companion `<Wordmark>`, `<Steps>`, `<AuthTitle>`, `<AuthSub>`.
- Adopted on 9 routes: `/auth/login`, `/auth/recovery`, all 5 onboarding steps + the 2 restore steps, `/pair` (both roles), and `<ProfileView>` (used by `/profile/:accountID`).
- Force-dark theming on every auth surface (Headline Observation #1 from the Phase A audit).
- Lowercase typography on titles, labels, CTAs throughout the auth flow.
- Welcome subtitle shortened to "local-first · end-to-end encrypted" per design.

Audit rows closed: AUDIT-001..006, AUDIT-025..028, AUDIT-039..042.

## Test plan

- [ ] `npm run check-tokens` exits 0
- [ ] `npx tsc -b --noEmit` exits 0
- [ ] `npx vitest run` exits 0
- [ ] Spot-check the 9 routes in `npm run dev:all` — cosmic backdrop, Wordmark, lowercase typography visible on each
- [ ] Force-dark holds when system pref = light
EOF
)"
```

---

## Self-review (run after writing the plan, before handing it off)

**Spec coverage:**
- AUDIT-001..002 (`/auth/login`) → Task 2.1 ✓
- AUDIT-003..004 (`/auth/recovery`) → Task 2.2 ✓
- AUDIT-005..006 (`/onboarding`) → Tasks 3.1..3.6 (welcome + 4 steps + 2 restore steps) ✓
- AUDIT-025..028 (`/profile/:accountID`) → Task 5.1 ✓
- AUDIT-039..040 (pair initiator) → Task 4.2 ✓
- AUDIT-041..042 (pair responder) → Task 4.3 ✓
- Headline #1 (theme inconsistency) → `forceDark` prop in Task 1.2; consumed by every AuthSurface call ✓
- Headline #6 (welcome subtitle) → Task 3.1 short copy ✓
- Headline #7 (onboarding CTA labels) → Task 3.1 lowercase + reframed `create account` / `restore from recovery code` + sign-in row ✓

**Placeholder scan:** None. All "TBD"/"TODO"/"similar to" patterns avoided; full code shown for every modified route block.

**Type consistency:**
- `<AuthSurface>` props: `w`, `tall`, `forceDark`, `children` — used identically across all 13+ call sites.
- `<Wordmark>` accepts `size`; called with 20, 22, 26, 30 across routes — consistent prop name.
- `<Steps>` accepts `n` (required), `of` (default 4) — consistent across credentials (n=1), backup-display (n=2), backup-confirm (n=3), profile (n=4) call sites.
- `<AuthTitle>`, `<AuthSub>` accept only `children`. Used by every route consistently.
- Data-testids on routes preserved verbatim — e2e selectors unbroken.

**Non-coverage flagged for follow-up (NOT in this plan, but worth tracking):**
- Mobile safe-area-inset padding (AUDIT-002, 004, 006, 028, 040, 042 mention this — proposed for sub-unit 8d per the audit doc; not in 8a scope).
- Profile-view shared-conversations section visual treatment beyond cosmic backdrop (sub-unit 8a per audit closes the backdrop only; the section itself was sized in Unit 4).
- The cosmic gradient token `bg-gradient-cosmic` from Prep · Tokens — we use `bg-bg` in this plan; promoting is a single-line follow-up once that prep ships.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-13-unit-8a-auth-surface.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task (Tasks 0.1, 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 5.1, 6.1, 6.2, 6.3 — 18 tasks), review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch with checkpoints after Phase 1 (primitive ready), Phase 3 (onboarding done), Phase 5 (all routes adopted).

**Which approach?**
