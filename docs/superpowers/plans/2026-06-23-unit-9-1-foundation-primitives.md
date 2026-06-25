# Unit 9-1 — Foundation primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-calibrate the shared visual primitives to the design's `v5` soft skin so every Unit-9 surface inherits the correct look: pill/round-12 radii, rounded-rect avatars, a theme-aware QR, and vertically-centered auth surfaces.

**Architecture:** Add the `v5` radius tokens to `tokens.css` + Tailwind, then migrate the four shared primitives (`Button`, `TextField`, `Avatar`, `ConversationAvatar`), the QR component, and `AuthSurface` centering. These are leaf/shared components, so the change propagates to every consumer without per-screen edits. TDD via token-string tests + component render tests (jsdom/Vitest).

**Tech Stack:** React 18 + TS strict, Tailwind v3, `qrcode.react` (QRCodeSVG), Vitest + Testing Library, token guard `npm run check-tokens`.

**Spec:** `docs/superpowers/specs/2026-06-23-unit-9-ia-interaction-design.md` § 9-1 (DEC-1..DEC-4).

**Design source of truth:** `design/hf-kit.jsx` v5 skin — `radius: 12`, `soft: true` (→ buttons `borderRadius: 999`), `bubbleRadius: 14`, `avatarRadius: 10`; profile avatar `radius+6` ≈ 18; cards `radius+2` ≈ 14. QR: `design/hf-flows.jsx` renders modules in `c.text` on `c.panel`.

**Current state (verified):**
- `src/styles/tokens.css:67-71` radius scale: `--r-0:0 --r-1:2 --r-2:4 --r-3:6 --r-pill:999`.
- `tailwind.config.ts:73-82` maps `rounded-r-0..r-3` + `rounded-pill`.
- `Button` base class uses `rounded-r-3` (6px). `TextField` uses `rounded-r-3`. `Avatar` uses `rounded-full`. `ConversationAvatar` uses `rounded-pill`. `QRDisplay` uses `qrcode.react` defaults (black-on-white) in a `rounded-lg border bg-panel` frame.

---

## File structure

- Modify: `src/styles/tokens.css` — add `--r-4: 12px`, `--r-5: 14px`, `--r-avatar: 10px`, `--r-avatar-lg: 18px`.
- Modify: `tailwind.config.ts` — map `rounded-r-4`, `rounded-r-5`, `rounded-avatar`, `rounded-avatar-lg`.
- Modify: `src/components/ui/button.tsx` — base radius → `rounded-pill`.
- Modify: `src/components/ui/text-field.tsx` — `rounded-r-3` → `rounded-r-4`.
- Modify: `src/components/avatar.tsx` — `rounded-full` → `rounded-avatar` (sm/md) and `rounded-avatar-lg` (lg).
- Modify: `src/components/conversation-avatar.tsx` — `rounded-pill` → `rounded-avatar`.
- Modify: `src/components/qr-display.tsx` — theme-aware modules + larger default + tokenized frame.
- Modify: `src/components/auth-surface.tsx` — `tall` mode vertical centering.
- Tests: `tests/unit/styles/tokens.test.ts` (extend), `tests/unit/components/{avatar,conversation-avatar,qr-display}.test.tsx`.

---

## Phase 0 · Setup

### Task 0.1: Branch

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git checkout main && git pull --ff-only
git checkout -b unit-9-1-foundation-primitives
```

---

## Phase 1 · Radius tokens (DEC-1)

### Task 1.1: Add the v5 radius tokens

**Files:** Modify `src/styles/tokens.css`, `tailwind.config.ts`, extend `tests/unit/styles/tokens.test.ts`.

- [ ] **Step 1: Failing test**

Append to `tests/unit/styles/tokens.test.ts`:

```typescript
test("v5 soft-skin radius tokens are present", () => {
  expect(tokensCss).toContain("--r-4: 12px");
  expect(tokensCss).toContain("--r-5: 14px");
  expect(tokensCss).toContain("--r-avatar: 10px");
  expect(tokensCss).toContain("--r-avatar-lg: 18px");
});
```

Run: `nix-shell --run 'npx vitest run tests/unit/styles/tokens.test.ts'` → expect FAIL.

- [ ] **Step 2: Add the tokens**

In `src/styles/tokens.css`, replace the radius block (lines ~67-71):

```css
  --r-0: 0px;
  --r-1: 2px;
  --r-2: 4px;
  --r-3: 6px;
  --r-4: 12px;   /* v5 soft base — inputs, list rows */
  --r-5: 14px;   /* v5 cards (radius+2) */
  --r-avatar: 10px;     /* rounded-rect avatars (v5 avatarRadius) */
  --r-avatar-lg: 18px;  /* profile-page avatar (radius+6) */
  --r-pill: 999px;
```

- [ ] **Step 3: Map in Tailwind**

In `tailwind.config.ts` `borderRadius` block (after `'r-3'`):

```typescript
        'r-4': 'var(--r-4)',
        'r-5': 'var(--r-5)',
        'avatar': 'var(--r-avatar)',
        'avatar-lg': 'var(--r-avatar-lg)',
```

- [ ] **Step 4: Test green + utilities resolve**

```bash
nix-shell --run 'npx vitest run tests/unit/styles/tokens.test.ts' 2>&1 | tail -3
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/tokens.css tailwind.config.ts tests/unit/styles/tokens.test.ts
git commit -m "feat(tokens): v5 soft-skin radii (r-4/r-5/avatar/avatar-lg)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2 · Button + input radii (DEC-1)

### Task 2.1: Pill buttons

**Files:** Modify `src/components/ui/button.tsx`.

- [ ] **Step 1: Change the base radius**

In `buttonVariants` base string, replace `rounded-r-3` with `rounded-pill`:

```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-pill font-body font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  { /* unchanged */ }
);
```

- [ ] **Step 2: Visual sanity**

`nix-shell --run 'npx tsc -b --noEmit'` (no type change expected) + `npm run check-tokens` clean.

### Task 2.2: Input radius

**Files:** Modify `src/components/ui/text-field.tsx`.

- [ ] **Step 1:** Replace `rounded-r-3` → `rounded-r-4` in the TextField class string.
- [ ] **Step 2: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/text-field.tsx
git commit -m "feat(ui): pill buttons + r-4 inputs (v5 soft skin)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3 · Rounded-rect avatars (DEC-4)

### Task 3.1: Avatar primitive

**Files:** Modify `src/components/avatar.tsx`, create `tests/unit/components/avatar.test.tsx`.

- [ ] **Step 1: Failing test**

```typescript
// tests/unit/components/avatar.test.tsx
import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { Avatar } from "@/components/avatar";

describe("Avatar", () => {
  test("uses rounded-rect (not rounded-full)", () => {
    const { getByRole } = render(<Avatar initials="AB" size="md" />);
    const el = getByRole("img");
    expect(el.className).toContain("rounded-avatar");
    expect(el.className).not.toContain("rounded-full");
  });
  test("lg size uses the larger avatar radius", () => {
    const { getByRole } = render(<Avatar initials="AB" size="lg" />);
    expect(getByRole("img").className).toContain("rounded-avatar-lg");
  });
});
```

Run → expect FAIL.

- [ ] **Step 2: Implement**

In `src/components/avatar.tsx`, change `SIZE_CLASSES` to carry the radius, and the wrapper `className` to drop `rounded-full`:

```typescript
const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "w-8 h-8 text-xs rounded-avatar",
  md: "w-10 h-10 text-sm rounded-avatar",
  lg: "w-24 h-24 text-2xl rounded-avatar-lg",
};
```

And in the wrapper `div className`, remove `rounded-full` (the radius now comes from `sizeClasses`):

```typescript
      className={`bg-primary/10 flex items-center justify-center font-medium text-primary flex-shrink-0 overflow-hidden ${sizeClasses} ${className ?? ""}`}
```

- [ ] **Step 3: Test green**

`nix-shell --run 'npx vitest run tests/unit/components/avatar.test.tsx'` → PASS.

### Task 3.2: ConversationAvatar primitive

**Files:** Modify `src/components/conversation-avatar.tsx`, create `tests/unit/components/conversation-avatar-shape.test.tsx`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { ConversationAvatar } from "@/components/conversation-avatar";

test("ConversationAvatar is rounded-rect not pill", () => {
  const { getByTestId } = render(
    <ConversationAvatar conversationId="co_x" title="Bob" />,
  );
  const el = getByTestId("conversation-avatar");
  expect(el.className).toContain("rounded-avatar");
  expect(el.className).not.toContain("rounded-pill");
});
```

- [ ] **Step 2: Implement** — in `conversation-avatar.tsx`, change the wrapper class `rounded-pill` → `rounded-avatar`.
- [ ] **Step 3: Test green.**
- [ ] **Step 4: Commit**

```bash
git add src/components/avatar.tsx src/components/conversation-avatar.tsx tests/unit/components/avatar.test.tsx tests/unit/components/conversation-avatar-shape.test.tsx
git commit -m "feat(avatar): rounded-rect avatars (DEC-4, v5 avatarRadius)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4 · Theme-aware QR (DEC-3)

### Task 4.1: Theme-aware, larger QR

**Files:** Modify `src/components/qr-display.tsx`, create `tests/unit/components/qr-display.test.tsx`.

Design intent (`hf-flows.jsx`): modules in `c.text`, background `c.panel`, theme-reactive. `QRCodeSVG` accepts `bgColor` + `fgColor`. We read the resolved theme via `useTheme()` and feed CSS-variable-resolved hex, OR pass `currentColor`-style values. Since `QRCodeSVG` needs concrete colors (not CSS vars), resolve them from the computed style at render.

- [ ] **Step 1: Failing test**

```typescript
import { describe, test, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QRDisplay } from "@/components/qr-display";

// useTheme is consumed by QRDisplay; stub to dark.
vi.mock("@/styles/use-theme", () => ({ useTheme: () => ({ theme: "dark" }) }));

test("QR renders module + bg colors (not default black/white)", () => {
  const { container } = render(<QRDisplay url="https://x" />);
  const svg = container.querySelector("svg");
  expect(svg).toBeTruthy();
  // fgColor applied to the modules path; bgColor to the backing rect.
  const fg = svg?.getAttribute("fill") ?? svg?.innerHTML ?? "";
  expect(fg).not.toBe("#000000");
});
```

(Adjust the assertion to however `QRCodeSVG` surfaces `fgColor` in the DOM — inspect the rendered SVG once and pin the real attribute.)

- [ ] **Step 2: Implement**

Read the theme and pass resolved colors. Use the token hexes directly (dark: text `#c8d1f0`, panel `#12141f`; light: ink `#0b0d14`, paper `#f4f3ee`) via a small map keyed on theme, OR resolve `getComputedStyle(document.documentElement).getPropertyValue('--color-text')` at render. Prefer the computed-style approach so it tracks future token changes:

```typescript
import { QRCodeSVG } from "qrcode.react";
import { useTheme } from "@/styles/use-theme";

interface QRDisplayProps { url: string; size?: number; showText?: boolean; }

export function QRDisplay({ url, size = 300, showText = false }: QRDisplayProps) {
  useTheme(); // re-render on theme flip
  const root = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const fg = root?.getPropertyValue("--color-text").trim() || "#c8d1f0";
  const bg = root?.getPropertyValue("--color-panel").trim() || "#12141f";
  return (
    <div className="flex flex-col items-center gap-3" data-testid="qr-display">
      <div className="rounded-r-5 border border-hairline bg-panel p-4">
        <QRCodeSVG value={url} size={size} level="M" fgColor={fg} bgColor={bg} />
      </div>
      {showText && (
        <code className="break-all text-xs text-dim" data-testid="qr-url-text">{url}</code>
      )}
    </div>
  );
}
```

Note: default size bumped 256 → 300 (DEC-3 "larger"). Frame `rounded-lg` → `rounded-r-5`; `text-muted-foreground` → `text-dim` (token-correct).

- [ ] **Step 3: Test green + check-tokens** (the old `text-muted-foreground` is removed).
- [ ] **Step 4: Commit**

```bash
git add src/components/qr-display.tsx tests/unit/components/qr-display.test.tsx
git commit -m "feat(qr): theme-aware QR (modules=text, bg=panel) + larger default (DEC-3)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 5 · AuthSurface vertical centering (DEC-2)

### Task 5.1: Center the tall variant

**Files:** Modify `src/components/auth-surface.tsx`.

- [ ] **Step 1: Locate the alignment**

```bash
grep -n "flex-start\|items-\|tall\|justify" src/components/auth-surface.tsx
```

- [ ] **Step 2: Change `tall` mode** so the card column is vertically centered (matching the non-tall/login path), while still allowing scroll when content exceeds viewport height. Replace the `tall ? "items-start" : "items-center"` (or equivalent) so both center; for overflow use `overflow-y-auto` + `my-auto` on the inner column rather than top-anchoring. Concretely: outer container `flex items-center justify-center min-h-screen overflow-y-auto`, inner column `my-auto py-8`.

- [ ] **Step 3: Verify** via `nix-shell --run 'npm run dev:all'` — `/onboarding`, `/auth/recovery`, `/pair` should center vertically like `/auth/login`. (Manual; or screenshot via audit:capture.)

- [ ] **Step 4: Commit**

```bash
git add src/components/auth-surface.tsx
git commit -m "fix(auth-surface): vertically center tall variant (DEC-2)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 6 · Verify + merge

### Task 6.1: Full check

```bash
nix-shell --run 'npm run check-tokens'
nix-shell --run 'npx tsc -b --noEmit'
nix-shell --run 'npx vitest run' 2>&1 | tail -5
nix-shell --run 'timeout 90 npm run build' 2>&1 | tail -5
```

### Task 6.2: Merge

```bash
git push -u origin unit-9-1-foundation-primitives
git checkout main && git merge --no-ff unit-9-1-foundation-primitives -m "Merge Unit 9-1: foundation primitives"
git branch -d unit-9-1-foundation-primitives
```

---

## Self-review checklist

- [ ] `--r-4/r-5/avatar/avatar-lg` tokens added + Tailwind-mapped + tested.
- [ ] Buttons pill; inputs r-4.
- [ ] Avatar + ConversationAvatar rounded-rect (tests assert no `rounded-full`/`rounded-pill`).
- [ ] QR theme-aware (modules=text, bg=panel), larger default, token-correct frame.
- [ ] AuthSurface tall variant centers vertically.
- [ ] check-tokens + tsc + vitest + build all clean.
- [ ] No consumer-side edits needed (changes are in shared primitives) — spot-check that existing screens still render.
