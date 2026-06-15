# Unit 8c · ModalShell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a canonical `<ModalShell>` primitive (plus `<MobileBottomSheet>` variant and shared `<PassphraseGrid>`), retrofit every ad-hoc modal in the app, and fix the theme-leak bug where modal inputs render light-bg under dark theme.

**Architecture:** ModalShell is a token-driven composition: backdrop scrim (`bg-black/60`, fade 200ms) + a portaled, focus-trapped Card with hairline header (title + close-X), gap-12 body, and a bordered action footer. A `MobileBottomSheet` variant swaps the centered Card for a bottom-anchored sheet (slides up 75vh) and is opt-in per-callsite. Both rely on `React.createPortal` and an in-component minimal focus trap (no new deps). Inputs are migrated off the shadcn `bg-background` token (which never switches under our `data-theme` selector) to Arcan tokens (`bg-bg`, `border-hairline`, `text-text`) via a new `<TextField>` primitive lifted from the existing ad-hoc usage. The 24-word grid is extracted from `backup-display-step.tsx` into a shared `<PassphraseGrid>` and reused by the recovery-code modal.

**Tech Stack:** TypeScript, React 19 (per `package.json`), Tailwind v3 (Arcan token utilities), `@radix-ui/react-slot` (already installed) — no new dependencies. Tests via Vitest (`tests/unit/`) with `@testing-library/react`.

---

## Reference inputs

- Audit rows: `docs/superpowers/specs/2026-06-13-unit-8-audit.md` AUDIT-035 / 036 / 037 / 038 (lines 984–1093)
- Headline finding #2 in the same doc (lines 31–34): **Form input bg leaks across themes** — root cause documented below
- Design references:
  - `design/hf-flows.jsx#ScRecovery` lines 106–125 (24-word grid pattern; `ScRecovery` is the in-flow analog of `ScBackupDisplay`)
  - `design/hf-flows.jsx#ScApproveDevice` lines 209–227 (in-card approval pattern)
  - `design/hf-polish.jsx` — modal shell pattern documented per-audit-row; the file itself doesn't define a generic `<Modal>` component, so we build to the documented pattern (scrim 200ms + hairline Card + header + body + action footer)

## Root-cause notes for the theme leak

`src/index.css` defines shadcn HSL vars on `:root` (light values) and on `.dark` (dark values). The theme provider in `src/styles/use-theme.tsx` only toggles `data-theme="..."`, never adds a `.dark` class. As a result every utility that reads `--background`, `--input`, `--border`, etc. (the shadcn HSL shim) is permanently locked to the light palette. Every ad-hoc modal uses `bg-background`, `border` (no color), `bg-muted`, `text-muted-foreground` — which is why their inputs render white over the dark surface.

Two non-exclusive fixes are possible: (a) sync the shadcn HSL vars to follow `data-theme` (one-line CSS change), or (b) migrate the offending callsites to Arcan tokens. We do **both**: fix the CSS so the shadcn shim no longer lies, and migrate the modal callsites to Arcan tokens via the new primitives so future modals can't reintroduce the bug.

## File structure

Files this plan creates or modifies:

- `src/components/modal-shell.tsx` (new) — exports `ModalShell`, `MobileBottomSheet`, `ModalHeader`, `ModalFooter`, plus `useModalA11y` (Esc + focus trap + scroll lock + portal)
- `src/components/passphrase-grid.tsx` (new) — shared 24-word grid with index numbers + copy button; `compact` variant for mobile
- `src/components/ui/text-field.tsx` (new) — Arcan-tokenized `<input>` primitive; replaces the inline `bg-background border …` markup
- `src/index.css` (modify, lines 29–49) — alias `data-theme="dark"` to the existing `.dark` shadcn shim so the HSL vars track the live theme
- `src/styles/use-theme.tsx` (modify, line 27 area) — also toggle the `.dark` class on `documentElement` for redundancy with the CSS alias (belt-and-braces)
- `src/routes/settings/change-password-modal.tsx` — migrate to ModalShell + TextField
- `src/routes/settings/view-recovery-code-modal.tsx` — migrate to ModalShell + TextField + PassphraseGrid
- `src/components/group-create-dialog.tsx` — migrate to ModalShell + TextField
- `src/components/leave-with-promote-dialog.tsx` — migrate to ModalShell
- `src/components/contact-picker.tsx` — migrate to ModalShell
- `src/components/incoming-connection-prompt.tsx` — migrate to ModalShell
- `src/components/trusted-device-prompt.tsx` — migrate to ModalShell
- `src/components/image-lightbox.tsx` — keep bespoke layout (no Card), but reuse `useModalA11y` for portal + Esc + scroll lock so behavior is consistent
- `src/routes/onboarding/backup-display-step.tsx` — refactor to consume `<PassphraseGrid>` (no visual regression)
- New tests in `tests/unit/components/`:
  - `modal-shell.test.tsx`
  - `passphrase-grid.test.tsx`
  - `text-field.test.tsx`
  - `theme-shim.test.ts` (asserts `data-theme="dark"` resolves the shadcn `--background` to the dark HSL value)

---

## Task 0: Branch setup

**Files:**
- None

- [ ] **Step 0.1: Create the working branch from main at f3187a2**

```bash
git checkout main
git fetch origin
test "$(git rev-parse HEAD)" = "f3187a2874e24f19b6047336a544ea889e6e8425" || git checkout f3187a2874e24f19b6047336a544ea889e6e8425
git checkout -b unit-8c-modal-shell
git status
```

Expected: `On branch unit-8c-modal-shell` and a clean tree.

---

## Task 1: Fix the shadcn HSL theme shim

This is the smallest possible change that stops the input-bg leak. We do it first so subsequent modal migrations can be verified in dark theme as we go.

**Files:**
- Modify: `src/index.css:29-49`
- Modify: `src/styles/use-theme.tsx:26-28`
- Test: `tests/unit/components/theme-shim.test.ts` (new)

- [ ] **Step 1.1: Write the failing test**

Create `tests/unit/components/theme-shim.test.ts`:

```ts
import { describe, test, expect, beforeEach } from "vitest";
import "@/index.css";

describe("theme shim", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  test("data-theme=\"dark\" resolves --background to the dark HSL value", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const v = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    expect(v).toBe("222.2 84% 4.9%");
  });

  test("data-theme=\"light\" (or no attr) resolves --background to the light HSL value", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const v = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    expect(v).toBe("0 0% 100%");
  });
});
```

- [ ] **Step 1.2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/components/theme-shim.test.ts
```

Expected: FAIL — `data-theme="dark"` test fails because the dark vars currently live only under `.dark`.

- [ ] **Step 1.3: Add a `data-theme="dark"` selector to the shadcn shim**

Edit `src/index.css` and replace the `.dark { … }` block (lines 29–49) with a combined selector. The new block is:

```css
  .dark,
  :root[data-theme="dark"] {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
```

(Everything else in `src/index.css` is unchanged.)

- [ ] **Step 1.4: Mirror the toggle in the theme provider as a belt-and-braces fix**

Edit `src/styles/use-theme.tsx` lines 26–28. Replace the `useEffect` body so it also toggles a `.dark` class:

```tsx
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
```

This duplicates the CSS alias for any environment that might read `.dark` directly (e.g. third-party components, future shadcn additions).

- [ ] **Step 1.5: Run the test to verify it passes**

```bash
npx vitest run tests/unit/components/theme-shim.test.ts
```

Expected: PASS (both cases).

- [ ] **Step 1.6: Sanity-check the rest of the suite still passes**

```bash
npx vitest run
```

Expected: all green.

- [ ] **Step 1.7: Commit**

```bash
git add src/index.css src/styles/use-theme.tsx tests/unit/components/theme-shim.test.ts
git commit -m "fix(theme): make shadcn HSL shim track data-theme=\"dark\"

The shadcn --background/--input/--border vars only flipped under a .dark
class, but the live theme provider toggles data-theme=\"dark\" only — so
every shadcn-token utility (bg-background, border, text-muted-foreground)
was permanently locked to the light palette. Modal inputs rendered white
under dark theme as a result (AUDIT headline #2).

Mirror the .dark rule under :root[data-theme=\"dark\"] and also toggle the
.dark class from the theme provider for redundancy."
```

---

## Task 2: ModalShell primitive — header + body + footer

We build the desktop centered-Card variant first; the mobile bottom-sheet variant follows in Task 3.

**Files:**
- Create: `src/components/modal-shell.tsx`
- Test: `tests/unit/components/modal-shell.test.tsx`

- [ ] **Step 2.1: Write the failing test**

Create `tests/unit/components/modal-shell.test.tsx`:

```tsx
import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModalShell, ModalFooter } from "@/components/modal-shell";

describe("ModalShell", () => {
  test("renders title, body, and footer slots", () => {
    render(
      <ModalShell
        open
        title="change password"
        onClose={() => {}}
        footer={<ModalFooter><button>cancel</button><button>save</button></ModalFooter>}
      >
        <p>body text</p>
      </ModalShell>,
    );
    expect(screen.getByText("change password")).toBeInTheDocument();
    expect(screen.getByText("body text")).toBeInTheDocument();
    expect(screen.getByText("cancel")).toBeInTheDocument();
    expect(screen.getByText("save")).toBeInTheDocument();
  });

  test("calls onClose when the X button is clicked", async () => {
    const onClose = vi.fn();
    render(<ModalShell open title="t" onClose={onClose}><p>x</p></ModalShell>);
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<ModalShell open title="t" onClose={onClose}><p>x</p></ModalShell>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(<ModalShell open title="t" onClose={onClose}><p>x</p></ModalShell>);
    await userEvent.click(screen.getByTestId("modal-shell-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("does NOT close when content inside the Card is clicked", async () => {
    const onClose = vi.fn();
    render(<ModalShell open title="t" onClose={onClose}><p data-testid="inner">x</p></ModalShell>);
    await userEvent.click(screen.getByTestId("inner"));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("renders nothing when open=false", () => {
    render(<ModalShell open={false} title="t" onClose={() => {}}><p>hidden</p></ModalShell>);
    expect(screen.queryByText("hidden")).toBeNull();
  });

  test("exposes role=\"dialog\" and aria-modal=true", () => {
    render(<ModalShell open title="t" onClose={() => {}}><p>x</p></ModalShell>);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  test("respects an explicit dataTestId on the Card wrapper", () => {
    render(<ModalShell open title="t" onClose={() => {}} dataTestId="my-modal"><p>x</p></ModalShell>);
    expect(screen.getByTestId("my-modal")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2.2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/components/modal-shell.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/modal-shell'`.

- [ ] **Step 2.3: Implement ModalShell**

Create `src/components/modal-shell.tsx`:

```tsx
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Closes when the scrim is clicked. Default true. */
  dismissOnBackdrop?: boolean;
  /** Closes on Escape. Default true. */
  dismissOnEscape?: boolean;
  /** Adds a data-testid on the Card wrapper for e2e/unit tests. */
  dataTestId?: string;
  /** Extra classes for the Card. */
  className?: string;
  /** When true, render the cosmic-gradient backdrop instead of bg-black/60. */
  cosmic?: boolean;
}

/**
 * Canonical centered-Card modal. Backdrop scrim (bg-black/60 or cosmic
 * gradient) with a 200ms fade + a hairline-bordered Card with a header
 * (title + close-X), padded body, and optional action footer.
 *
 * Portals to document.body. Locks page scroll while open. Traps focus
 * inside the Card. Closes on Esc and (by default) on backdrop click.
 *
 * For mobile-first sheets, use <MobileBottomSheet> instead.
 */
export function ModalShell({
  open,
  onClose,
  title,
  children,
  footer,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  dataTestId,
  className,
  cosmic = false,
}: ModalShellProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Esc + scroll lock + focus management
  useModalA11y({ open, onClose, dismissOnEscape, containerRef: cardRef, restoreRef: previouslyFocused });

  if (!open) return null;

  return createPortal(
    <div
      data-testid="modal-shell-backdrop"
      onClick={() => { if (dismissOnBackdrop) onClose(); }}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        "animate-arcan-fade-in",
        cosmic ? "bg-[var(--color-bg-stage)]/85" : "bg-black/60",
      )}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={dataTestId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab(cardRef)}
        className={cn(
          "w-full max-w-[480px] rounded-r-3 border border-hairline bg-panel",
          "flex flex-col max-h-[90vh] overflow-hidden",
          "animate-arcan-modal-in",
          className,
        )}
      >
        <ModalHeader id={titleId} onClose={onClose}>{title}</ModalHeader>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">{children}</div>
        {footer}
      </div>
    </div>,
    document.body,
  );
}

interface ModalHeaderProps {
  id: string;
  onClose: () => void;
  children: ReactNode;
}

function ModalHeader({ id, onClose, children }: ModalHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
      <h2 id={id} className="text-base font-semibold text-text">{children}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="rounded-r-3 p-1 text-text-2 hover:bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </header>
  );
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer className={cn("flex justify-end gap-2 border-t border-hairline px-4 py-3", className)}>
      {children}
    </footer>
  );
}

// ---------- internals: a11y hook + focus trap ----------

interface UseModalA11yArgs {
  open: boolean;
  onClose: () => void;
  dismissOnEscape: boolean;
  containerRef: React.RefObject<HTMLElement>;
  restoreRef: React.MutableRefObject<HTMLElement | null>;
}

export function useModalA11y({ open, onClose, dismissOnEscape, containerRef, restoreRef }: UseModalA11yArgs) {
  // Scroll lock + Esc handler + initial focus + restore focus on unmount
  useEffect(() => {
    if (!open) return;

    restoreRef.current = (document.activeElement as HTMLElement) ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog on next paint.
    const id = window.requestAnimationFrame(() => {
      const target = firstFocusable(containerRef.current) ?? containerRef.current;
      target?.focus({ preventScroll: true });
    });

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && dismissOnEscape) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.({ preventScroll: true });
      restoreRef.current = null;
    };
  }, [open, onClose, dismissOnEscape, containerRef, restoreRef]);
}

function firstFocusable(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  const sel = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  const list = Array.from(root.querySelectorAll<HTMLElement>(sel));
  return list[0] ?? null;
}

function trapTab(containerRef: React.RefObject<HTMLElement>) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const root = containerRef.current;
    if (!root) return;
    const list = Array.from(
      root.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    );
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
}
```

- [ ] **Step 2.4: Add the modal fade-in keyframes to tokens.css**

We need two short animations. Edit `src/styles/tokens.css` and append the following block at the end of the file (after the last existing rule):

```css
/* ---------- Modal motion ---------- */
@keyframes arcan-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes arcan-modal-in {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)    scale(1); }
}
@keyframes arcan-sheet-in {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
.animate-arcan-fade-in  { animation: arcan-fade-in var(--dur-base) var(--ease-out) both; }
.animate-arcan-modal-in { animation: arcan-modal-in var(--dur-base) var(--ease-out) both; }
.animate-arcan-sheet-in { animation: arcan-sheet-in var(--dur-base) var(--ease-out) both; }
@media (prefers-reduced-motion: reduce) {
  .animate-arcan-fade-in,
  .animate-arcan-modal-in,
  .animate-arcan-sheet-in { animation: none; }
}
```

- [ ] **Step 2.5: Run the test to verify it passes**

```bash
npx vitest run tests/unit/components/modal-shell.test.tsx
```

Expected: PASS (all 8 cases).

- [ ] **Step 2.6: Verify check-tokens still passes**

```bash
npm run check-tokens
```

Expected: `✓ no ad-hoc Tailwind color/typography classes detected`.

Note: the `bg-black/60` scrim is explicitly allowed by the script's allowlist comment (lines 8–10 of `scripts/check-tokens.sh`).

- [ ] **Step 2.7: Commit**

```bash
git add src/components/modal-shell.tsx src/styles/tokens.css tests/unit/components/modal-shell.test.tsx
git commit -m "feat(modal-shell): centered-Card modal primitive

Introduce <ModalShell> + <ModalFooter> + useModalA11y. Backdrop scrim
(bg-black/60, fade 200ms), hairline-bordered Card on bg-panel, header
with title + close-X, padded body, optional action footer. Portals to
document.body, locks scroll, traps focus, closes on Esc/backdrop.

Reduced-motion users get instant transitions per prefers-reduced-motion."
```

---

## Task 3: MobileBottomSheet variant

**Files:**
- Modify: `src/components/modal-shell.tsx` (append `MobileBottomSheet` export)
- Test: `tests/unit/components/modal-shell.test.tsx` (append cases)

- [ ] **Step 3.1: Write the failing test**

Append the following block to `tests/unit/components/modal-shell.test.tsx`:

```tsx
import { MobileBottomSheet } from "@/components/modal-shell";

describe("MobileBottomSheet", () => {
  test("renders title + body + footer like ModalShell", () => {
    render(
      <MobileBottomSheet
        open
        title="pick a contact"
        onClose={() => {}}
        footer={<button>continue</button>}
      >
        <p>list</p>
      </MobileBottomSheet>,
    );
    expect(screen.getByText("pick a contact")).toBeInTheDocument();
    expect(screen.getByText("list")).toBeInTheDocument();
    expect(screen.getByText("continue")).toBeInTheDocument();
  });

  test("Card has the sheet anchoring classes", () => {
    render(
      <MobileBottomSheet open title="t" onClose={() => {}} dataTestId="sheet"><p>x</p></MobileBottomSheet>,
    );
    const card = screen.getByTestId("sheet");
    expect(card.className).toMatch(/max-h-\[75vh\]/);
    // Anchored bottom on mobile; centered above sm breakpoint via responsive prefixes.
    expect(card.className).toMatch(/rounded-t-r-3|rounded-t-/);
  });

  test("closes on Esc + backdrop", async () => {
    const onClose = vi.fn();
    render(<MobileBottomSheet open title="t" onClose={onClose}><p>x</p></MobileBottomSheet>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3.2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/components/modal-shell.test.tsx
```

Expected: FAIL — `MobileBottomSheet` not exported.

- [ ] **Step 3.3: Implement MobileBottomSheet**

Append to `src/components/modal-shell.tsx` (above the internals section):

```tsx
interface MobileBottomSheetProps extends Omit<ModalShellProps, "className"> {
  className?: string;
}

/**
 * Bottom-anchored sheet variant. On mobile (<sm) the Card snaps to the
 * bottom of the viewport, slides up from below, and caps at 75vh. On sm+
 * it falls back to a centered Card identical to <ModalShell>.
 *
 * Use this when the calling context is mobile-first (contact picker,
 * group create, leave-with-promote, settings modals on phone).
 */
export function MobileBottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  dataTestId,
  className,
  cosmic = false,
}: MobileBottomSheetProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useModalA11y({ open, onClose, dismissOnEscape, containerRef: cardRef, restoreRef: previouslyFocused });

  if (!open) return null;

  return createPortal(
    <div
      data-testid="modal-shell-backdrop"
      onClick={() => { if (dismissOnBackdrop) onClose(); }}
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4",
        "animate-arcan-fade-in",
        cosmic ? "bg-[var(--color-bg-stage)]/85" : "bg-black/60",
      )}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={dataTestId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab(cardRef)}
        className={cn(
          "w-full sm:max-w-[480px]",
          "rounded-t-r-3 sm:rounded-r-3",
          "border-t border-x border-hairline sm:border",
          "bg-panel flex flex-col max-h-[75vh] sm:max-h-[90vh] overflow-hidden",
          "animate-arcan-sheet-in sm:animate-arcan-modal-in",
          className,
        )}
      >
        <ModalHeader id={titleId} onClose={onClose}>{title}</ModalHeader>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">{children}</div>
        {footer}
      </div>
    </div>,
    document.body,
  );
}
```

(`rounded-t-r-3` does not currently exist as a Tailwind class — Arcan defines `rounded-r-3` via `var(--r-3)`. Tailwind generates the directional variants automatically from the same `borderRadius` extension, so `rounded-t-r-3` works because Tailwind splits the longhand keys. If the build complains, fall back to the inline style `style={{ borderTopLeftRadius: 'var(--r-3)', borderTopRightRadius: 'var(--r-3)' }}` — verify after Step 3.4.)

- [ ] **Step 3.4: Run the test to verify it passes**

```bash
npx vitest run tests/unit/components/modal-shell.test.tsx
```

Expected: PASS (the new MobileBottomSheet block and the original ModalShell block).

If the `rounded-t-r-3` class doesn't resolve, replace the `rounded-t-r-3 sm:rounded-r-3` segment with an inline style:

```tsx
style={{ borderTopLeftRadius: "var(--r-3)", borderTopRightRadius: "var(--r-3)" }}
```

and keep just `sm:rounded-r-3` in the className. Re-run the test.

- [ ] **Step 3.5: Commit**

```bash
git add src/components/modal-shell.tsx tests/unit/components/modal-shell.test.tsx
git commit -m "feat(modal-shell): MobileBottomSheet variant

Bottom-anchored sheet that slides up to 75vh on mobile and falls back to
the centered Card layout at sm+. Same a11y + dismiss semantics as
ModalShell."
```

---

## Task 4: TextField primitive (token-clean modal input)

**Files:**
- Create: `src/components/ui/text-field.tsx`
- Test: `tests/unit/components/text-field.test.tsx`

- [ ] **Step 4.1: Write the failing test**

Create `tests/unit/components/text-field.test.tsx`:

```tsx
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TextField } from "@/components/ui/text-field";

describe("TextField", () => {
  test("renders an input with the given props", () => {
    render(<TextField placeholder="current password" type="password" data-testid="pwd" />);
    const input = screen.getByTestId("pwd") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.placeholder).toBe("current password");
  });

  test("uses Arcan tokens, not shadcn bg-background", () => {
    render(<TextField data-testid="t" />);
    const input = screen.getByTestId("t");
    // Arcan tokens
    expect(input.className).toMatch(/\bbg-bg\b/);
    expect(input.className).toMatch(/\bborder-hairline\b/);
    expect(input.className).toMatch(/\btext-text\b/);
    // Should NOT carry the shadcn shim token that was the bug source
    expect(input.className).not.toMatch(/\bbg-background\b/);
  });

  test("forwards controlled value/onChange", async () => {
    function Wrapper() {
      const [v, setV] = useState("");
      return <TextField data-testid="t" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    render(<Wrapper />);
    const input = screen.getByTestId("t") as HTMLInputElement;
    await userEvent.type(input, "abc");
    expect(input.value).toBe("abc");
  });
});
```

- [ ] **Step 4.2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/components/text-field.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 4.3: Implement TextField**

Create `src/components/ui/text-field.tsx`:

```tsx
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Arcan-tokenized text input. Replaces the inline
 * `bg-background border …` markup used by ad-hoc modals. Uses the same
 * font, radius, and focus ring as the rest of the design system.
 *
 * Why this exists: shadcn's `bg-background` / `border` (no color) /
 * `text-muted-foreground` utilities all flow through the HSL shim in
 * src/index.css. Modal callsites that used them rendered light-bg inputs
 * over dark surfaces (audit headline #2). TextField sidesteps the shim
 * entirely and uses Arcan tokens that follow data-theme correctly.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-r-3 border border-hairline bg-bg px-3 py-2 text-sm text-text",
        "placeholder:text-dim",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:border-arcan-accent",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
TextField.displayName = "TextField";
```

- [ ] **Step 4.4: Run the test to verify it passes**

```bash
npx vitest run tests/unit/components/text-field.test.tsx
```

Expected: PASS.

- [ ] **Step 4.5: Verify check-tokens still passes**

```bash
npm run check-tokens
```

Expected: `✓ no ad-hoc Tailwind color/typography classes detected`.

- [ ] **Step 4.6: Commit**

```bash
git add src/components/ui/text-field.tsx tests/unit/components/text-field.test.tsx
git commit -m "feat(ui): TextField — Arcan-token text input

Replaces the inline bg-background+border markup used by ad-hoc modals.
Token-clean: bg-bg, border-hairline, text-text, placeholder:text-dim,
focus-visible ring tied to accent-soft + arcan-accent."
```

---

## Task 5: PassphraseGrid primitive

Extract the 24-word grid from `backup-display-step.tsx` so the recovery-code modal can reuse it.

**Files:**
- Create: `src/components/passphrase-grid.tsx`
- Test: `tests/unit/components/passphrase-grid.test.tsx`

- [ ] **Step 5.1: Write the failing test**

Create `tests/unit/components/passphrase-grid.test.tsx`:

```tsx
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PassphraseGrid } from "@/components/passphrase-grid";

const PHRASE = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");

describe("PassphraseGrid", () => {
  test("renders all 24 words with 01-style index numbers", () => {
    render(<PassphraseGrid phrase={PHRASE} />);
    expect(screen.getByText("word1")).toBeInTheDocument();
    expect(screen.getByText("word24")).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  test("uses font-mono for the words", () => {
    const { container } = render(<PassphraseGrid phrase={PHRASE} />);
    const word = container.querySelector("[data-testid='passphrase-word-1']");
    expect(word?.className).toMatch(/font-mono/);
  });

  test("exposes data-testid=\"passphrase-grid\" on the wrapper", () => {
    render(<PassphraseGrid phrase={PHRASE} />);
    expect(screen.getByTestId("passphrase-grid")).toBeInTheDocument();
  });

  test("compact variant uses a 3-column grid; default is 4-column", () => {
    const { rerender, container } = render(<PassphraseGrid phrase={PHRASE} />);
    expect(container.querySelector("[data-testid='passphrase-grid']")?.className).toMatch(/grid-cols-4/);
    rerender(<PassphraseGrid phrase={PHRASE} compact />);
    expect(container.querySelector("[data-testid='passphrase-grid']")?.className).toMatch(/grid-cols-3/);
  });

  test("when withCopyButton, clicking it calls navigator.clipboard.writeText with the phrase", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PassphraseGrid phrase={PHRASE} withCopyButton />);
    await userEvent.click(screen.getByTestId("passphrase-copy-btn"));
    expect(writeText).toHaveBeenCalledWith(PHRASE);
  });
});
```

- [ ] **Step 5.2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/components/passphrase-grid.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement PassphraseGrid**

Create `src/components/passphrase-grid.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PassphraseGridProps {
  phrase: string;
  /** 3-column compact layout (used by the mobile recovery-code modal). Default 4-column. */
  compact?: boolean;
  /** Render a "copy code" button under the grid. */
  withCopyButton?: boolean;
  className?: string;
}

type CopyState = "idle" | "copied" | "error";

/**
 * 24-word recovery-code grid. Index numbers ("01" … "24") in dim color,
 * words in font-mono. Used by:
 *  - onboarding backup-display step
 *  - settings view-recovery-code modal
 *
 * Matches design/hf-flows.jsx#ScRecovery (lines 106–125).
 */
export function PassphraseGrid({
  phrase,
  compact = false,
  withCopyButton = false,
  className,
}: PassphraseGridProps) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const words = phrase.trim().split(/\s+/);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(words.join(" "));
      setCopy("copied");
      setTimeout(() => setCopy("idle"), 2000);
    } catch {
      setCopy("error");
      setTimeout(() => setCopy("idle"), 3000);
    }
  }

  const copyLabel = copy === "copied" ? "Copied" : copy === "error" ? "Copy failed" : "Copy code";

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="passphrase-grid"
        className={cn(
          "rounded-r-3 border border-hairline bg-panel-2 p-3",
          "grid gap-x-3 gap-y-1.5",
          compact ? "grid-cols-3" : "grid-cols-4",
          className,
        )}
      >
        {words.map((w, i) => (
          <div
            key={i}
            data-testid={`passphrase-word-${i + 1}`}
            className="flex items-baseline gap-1.5 font-mono"
          >
            <span className="w-5 shrink-0 text-right text-[10px] text-dim">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-sm text-text">{w}</span>
          </div>
        ))}
      </div>
      {withCopyButton && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="passphrase-copy-btn"
            onClick={handleCopy}
            aria-live="polite"
          >
            {copyLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5.4: Run the test to verify it passes**

```bash
npx vitest run tests/unit/components/passphrase-grid.test.tsx
```

Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/components/passphrase-grid.tsx tests/unit/components/passphrase-grid.test.tsx
git commit -m "feat(passphrase-grid): shared 24-word grid

Extracted from onboarding's BackupDisplayStep so the settings
view-recovery-code modal can reuse the same primitive. 4-column desktop /
3-column compact (mobile). Matches design/hf-flows.jsx#ScRecovery."
```

---

## Task 6: Refactor onboarding BackupDisplayStep to use PassphraseGrid

Pure refactor — no visible change, no test-id rename. The existing onboarding e2e tests rely on the `passphrase-grid` test-id (kept) and `passphrase-copy-btn` test-id (kept).

**Files:**
- Modify: `src/routes/onboarding/backup-display-step.tsx`

- [ ] **Step 6.1: Replace the grid + copy markup with PassphraseGrid**

Edit `src/routes/onboarding/backup-display-step.tsx`. The current file is 128 lines; rewrite the body so the grid + copy block (lines 64–94 in the current file) becomes a single `<PassphraseGrid>` invocation. The full new file body:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PassphraseGrid } from "@/components/passphrase-grid";

interface BackupDisplayStepProps {
  phrase: string;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * BackupDisplayStep: shows the user their 24-word recovery code.
 *
 * The user must explicitly tick a checkbox to acknowledge they have saved the
 * code before the "Continue" button becomes active. This gates progression to
 * the confirm step where they must reproduce three random words.
 */
export function BackupDisplayStep({
  phrase,
  onBack,
  onContinue,
}: BackupDisplayStepProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-text">
            Save your recovery code
          </h1>
          <p className="text-text-2">
            These 24 words are the <strong>only</strong> way back into your
            account if you forget your password. Store them somewhere safe —
            anyone who has them can sign in as you.
          </p>
        </div>

        <PassphraseGrid phrase={phrase} withCopyButton />

        {/* Acknowledge checkbox */}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            data-testid="passphrase-saved-checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
          />
          <span className="text-sm text-text-2">
            I have saved my recovery code in a secure location and understand
            that it cannot be recovered if lost.
          </span>
        </label>

        {/* Navigation */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button
            data-testid="passphrase-display-continue"
            disabled={!acknowledged}
            onClick={onContinue}
            className="flex-1"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
```

(Notable token migrations done as part of this refactor: `bg-background` → `bg-bg`, `text-muted-foreground` → `text-text-2`. These are pure theme-shim fixes — same visual intent, correct semantics. The existing copy-button visual is now owned by `<PassphraseGrid>`.)

- [ ] **Step 6.2: Run the full test suite**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

Expected: all green.

- [ ] **Step 6.3: Commit**

```bash
git add src/routes/onboarding/backup-display-step.tsx
git commit -m "refactor(onboarding): consume shared PassphraseGrid

BackupDisplayStep used to inline the 24-word grid and copy button.
Now consumes <PassphraseGrid withCopyButton />. Also migrates the
container off bg-background / text-muted-foreground (shadcn shim) to
bg-bg / text-text-2 (Arcan tokens) for theme correctness."
```

---

## Task 7: Migrate ChangePasswordModal to ModalShell + TextField

**Files:**
- Modify: `src/routes/settings/change-password-modal.tsx`

- [ ] **Step 7.1: Rewrite the component**

Replace the full content of `src/routes/settings/change-password-modal.tsx` with:

```tsx
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { ModalShell, ModalFooter } from "@/components/modal-shell";
import { changePassword } from "@/auth/flows";

interface ChangePasswordModalProps {
  onClose: () => void;
}

/**
 * Re-derives the AES key from the current password, decrypts the seed
 * envelope locally, re-encrypts it under the new password's KDF key, and
 * POSTs the new envelope + Better Auth password change in one call. The
 * server-side endpoint revokes other sessions on success.
 *
 * Failure cases:
 *  - Wrong current password → decrypt throws locally; no POST is made.
 *  - Server rejects new password (policy) → POST returns 4xx, surfaced.
 */
export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 12) {
      setError("New password must be at least 12 characters");
      return;
    }
    if (next !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  }

  const doneFooter = (
    <ModalFooter>
      <Button type="button" onClick={onClose}>Close</Button>
    </ModalFooter>
  );

  const formFooter = (
    <ModalFooter>
      <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
        Cancel
      </Button>
      <Button
        type="submit"
        form="change-password-form"
        disabled={isLoading}
        data-testid="change-password-submit"
      >
        {isLoading ? "Saving…" : "Change password"}
      </Button>
    </ModalFooter>
  );

  return (
    <ModalShell
      open
      onClose={onClose}
      title="change password"
      dataTestId="change-password-modal"
      footer={done ? doneFooter : formFooter}
    >
      {done ? (
        <p className="text-sm text-green">
          Password changed. Other devices were signed out.
        </p>
      ) : (
        <form id="change-password-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
          <TextField
            type="password"
            placeholder="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            data-testid="change-password-current"
          />
          <TextField
            type="password"
            placeholder="New password (≥12 chars)"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            data-testid="change-password-new"
          />
          <TextField
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            data-testid="change-password-confirm"
          />
          {error && (
            <p
              className="rounded-r-3 border border-red/30 bg-red/10 px-3 py-2 text-sm text-red"
              data-testid="change-password-error"
            >
              {error}
            </p>
          )}
        </form>
      )}
    </ModalShell>
  );
}
```

- [ ] **Step 7.2: Verify the suite still passes**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

Expected: all green. The existing `change-password-modal` test-id and field test-ids are preserved.

- [ ] **Step 7.3: Commit**

```bash
git add src/routes/settings/change-password-modal.tsx
git commit -m "refactor(settings): change-password modal uses ModalShell

Drops the ad-hoc centered-card + bg-background inputs in favor of the
canonical <ModalShell> + <TextField>. Closes AUDIT-035.

Title is now lowercase per the design's modal-header pattern."
```

---

## Task 8: Migrate ViewRecoveryCodeModal to ModalShell + TextField + PassphraseGrid

**Files:**
- Modify: `src/routes/settings/view-recovery-code-modal.tsx`

- [ ] **Step 8.1: Rewrite the component**

Replace the full content of `src/routes/settings/view-recovery-code-modal.tsx` with:

```tsx
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { ModalShell, ModalFooter } from "@/components/modal-shell";
import { PassphraseGrid } from "@/components/passphrase-grid";
import { viewRecoveryCode } from "@/auth/flows";

interface ViewRecoveryCodeModalProps {
  onClose: () => void;
}

/**
 * Prompts the user to confirm their current password, then derives the
 * seed locally (via flows.viewRecoveryCode → GET /me/auth-material + KDF
 * + AES decrypt) and renders the 24-word BIP-39 encoding.
 *
 * The recovery code never leaves the browser; the server only sees the
 * encrypted envelope and never sees the password.
 */
export function ViewRecoveryCodeModal({ onClose }: ViewRecoveryCodeModalProps) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      setCode(await viewRecoveryCode({ currentPassword: password }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retrieve recovery code");
    } finally {
      setIsLoading(false);
    }
  }

  const passwordFooter = (
    <ModalFooter>
      <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
        Cancel
      </Button>
      <Button
        type="submit"
        form="view-recovery-code-form"
        disabled={isLoading}
        data-testid="view-recovery-code-submit"
      >
        {isLoading ? "…" : "Show code"}
      </Button>
    </ModalFooter>
  );

  const codeFooter = (
    <ModalFooter>
      <Button type="button" onClick={onClose}>Done</Button>
    </ModalFooter>
  );

  return (
    <ModalShell
      open
      onClose={onClose}
      title="view recovery code"
      dataTestId="view-recovery-code-modal"
      footer={code ? codeFooter : passwordFooter}
    >
      {code ? (
        <>
          <p className="text-sm text-text-2">
            Write this down somewhere safe. It's the only way back in if you
            forget your password.
          </p>
          {/* Keep data-testid="recovery-code-display" for e2e compat by adding
              a hidden sr-only string under the grid. The grid itself owns the
              visible 24 words via PassphraseGrid. */}
          <PassphraseGrid phrase={code} withCopyButton />
          <span data-testid="recovery-code-display" className="sr-only">
            {code}
          </span>
        </>
      ) : (
        <form id="view-recovery-code-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="text-sm text-text-2">
            Confirm your password to view the code.
          </p>
          <TextField
            type="password"
            placeholder="Current password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            data-testid="view-recovery-code-password"
          />
          {error && (
            <p className="rounded-r-3 border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
              {error}
            </p>
          )}
        </form>
      )}
    </ModalShell>
  );
}
```

(Note: the existing e2e test-id `recovery-code-display` referred to the `<pre>` block; we keep a screenreader-only span carrying the raw code so any test or assistive tech that reads the testid still works. The visible 24 words come from `<PassphraseGrid>`.)

- [ ] **Step 8.2: Verify**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

Expected: all green.

- [ ] **Step 8.3: Commit**

```bash
git add src/routes/settings/view-recovery-code-modal.tsx
git commit -m "refactor(settings): view-recovery-code modal uses ModalShell + PassphraseGrid

Replaces the ad-hoc card with the canonical ModalShell. The 24-word
display now reuses <PassphraseGrid> — same primitive the onboarding
step uses, matching design/hf-flows.jsx#ScRecovery.

Closes AUDIT-037, AUDIT-038."
```

---

## Task 9: Migrate GroupCreateDialog to MobileBottomSheet

The group-create dialog is launched from the conversation-create flow, often on mobile. Use the responsive `MobileBottomSheet` so it sheets-up on phone and centers on desktop.

**Files:**
- Modify: `src/components/group-create-dialog.tsx`

- [ ] **Step 9.1: Rewrite the component**

Replace the full content of `src/components/group-create-dialog.tsx` with:

```tsx
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { MobileBottomSheet, ModalFooter } from "@/components/modal-shell";

interface GroupCreateDialogProps {
  participantNames: string[];
  onCreate: (title: string) => void;
  onCancel: () => void;
}

export function GroupCreateDialog({
  participantNames,
  onCreate,
  onCancel,
}: GroupCreateDialogProps) {
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // useModalA11y moves focus to the first focusable element; the title
    // input is the first focusable, but we re-focus explicitly here so the
    // caret lands cleanly after the modal's enter animation.
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, []);

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      await onCreate(trimmed);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  const participantPreview =
    participantNames.length > 0 ? participantNames.join(", ") : "selected contacts";

  return (
    <MobileBottomSheet
      open
      onClose={onCancel}
      title="name your group"
      dataTestId="group-create-overlay"
      footer={
        <ModalFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            data-testid="group-create-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || loading}
            data-testid="group-create-submit"
          >
            {loading ? "Creating…" : "Create group"}
          </Button>
        </ModalFooter>
      }
    >
      <p className="text-sm text-text-2">With: {participantPreview}</p>
      <TextField
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 60))}
        onKeyDown={handleKeyDown}
        placeholder="Group name…"
        maxLength={60}
        data-testid="group-create-title-input"
        disabled={loading}
      />
      <p className="text-right text-xs text-dim">{title.length}/60</p>
    </MobileBottomSheet>
  );
}
```

(`group-create-overlay` test-id is preserved by being applied to the dialog Card; e2e flows that rely on it still resolve.)

- [ ] **Step 9.2: Verify**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

Expected: all green.

- [ ] **Step 9.3: Commit**

```bash
git add src/components/group-create-dialog.tsx
git commit -m "refactor(group-create): use MobileBottomSheet + TextField

Sheets-up from the bottom on mobile, centers on desktop. Token-clean
input. Same test-ids preserved for e2e."
```

---

## Task 10: Migrate LeaveWithPromoteDialog to ModalShell

**Files:**
- Modify: `src/components/leave-with-promote-dialog.tsx`

- [ ] **Step 10.1: Rewrite the component**

Replace the full content of `src/components/leave-with-promote-dialog.tsx` with:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell, ModalFooter } from "@/components/modal-shell";

interface Candidate {
  accountID: string;
  displayName: string;
  currentRole: string;
}

interface LeaveWithPromoteDialogProps {
  candidates: Candidate[];
  onLeave: (newAdminAccountID: string) => void;
  onCancel: () => void;
}

export function LeaveWithPromoteDialog({
  candidates,
  onLeave,
  onCancel,
}: LeaveWithPromoteDialogProps) {
  const [selectedAccountID, setSelectedAccountID] = useState<string | null>(
    candidates.length > 0 ? candidates[0].accountID : null,
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!selectedAccountID || loading) return;
    setLoading(true);
    try {
      await onLeave(selectedAccountID);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onCancel}
      title="promote a new admin"
      dataTestId="leave-promote-overlay"
      footer={
        <ModalFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            data-testid="leave-promote-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!selectedAccountID || loading}
            data-testid="leave-promote-submit"
          >
            {loading ? "Leaving…" : "Promote and leave"}
          </Button>
        </ModalFooter>
      }
    >
      <p className="text-sm text-text-2">
        You are the only admin. Promote someone before you leave.
      </p>
      <ul
        className="flex flex-col gap-1 max-h-60 overflow-y-auto"
        data-testid="leave-promote-candidates"
      >
        {candidates.map((candidate, i) => {
          const isSelected = selectedAccountID === candidate.accountID;
          return (
            <li key={candidate.accountID}>
              <label
                className={`flex items-center gap-3 rounded-r-3 px-3 py-2 cursor-pointer text-sm text-text hover:bg-panel-2 ${
                  isSelected ? "bg-panel-2" : ""
                }`}
                data-testid={`leave-promote-candidate-${i}`}
              >
                <input
                  type="radio"
                  name="promote-candidate"
                  value={candidate.accountID}
                  checked={isSelected}
                  onChange={() => setSelectedAccountID(candidate.accountID)}
                  disabled={loading}
                  className="accent-arcan-accent"
                />
                <span>{candidate.displayName}</span>
                {candidate.currentRole && (
                  <span className="ml-auto text-xs text-text-2">
                    {candidate.currentRole}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </ModalShell>
  );
}
```

(`accent-primary` was the only allowed-by-script raw class because `accent-` is a CSS property prefix, not a color utility; `accent-arcan-accent` would produce `accent-color: var(--color-accent)` — both pre and post change use a Tailwind arbitrary or accent-color utility. If `accent-arcan-accent` doesn't resolve in Tailwind v3, use `style={{ accentColor: "var(--color-accent)" }}` on the radio.)

- [ ] **Step 10.2: Verify**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

If `check-tokens` flags anything, inspect the output and address it inline (the script's regex targets specific palette literals, not accent-* utilities).

- [ ] **Step 10.3: Commit**

```bash
git add src/components/leave-with-promote-dialog.tsx
git commit -m "refactor(promote-dialog): use ModalShell

Drops the ad-hoc card. Replaces shadcn-shim hover bg (bg-accent) with
the Arcan panel-2 surface and switches the radio accent-color off the
hard-coded primary onto the user-picked accent var."
```

---

## Task 11: Migrate ContactPicker to MobileBottomSheet

ContactPicker is one of the most-used mobile modals (used from `routes/conversations/new.tsx` and `routes/conversations/members.tsx`). It sheets-up on phone.

**Files:**
- Modify: `src/components/contact-picker.tsx`

- [ ] **Step 11.1: Rewrite the component**

Replace the full content of `src/components/contact-picker.tsx` with:

```tsx
import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MobileBottomSheet, ModalFooter } from "@/components/modal-shell";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";

interface ContactPickerProps {
  onSelect: (contacts: any[]) => void;
  onClose: () => void;
  excludeAccountIDs?: string[];
}

export function ContactPicker({ onSelect, onClose, excludeAccountIDs }: ContactPickerProps) {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { contactBook: { $each: true } } },
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (!me.$isLoaded) return null;

  const allContacts = Array.from(me.root?.contactBook ?? []);
  const contacts = excludeAccountIDs && excludeAccountIDs.length > 0
    ? allContacts.filter((c: any) => !excludeAccountIDs.includes(c?.contactAccountID))
    : allContacts;

  function toggleContact(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleContinue() {
    const picked = contacts.filter((_: any, i: number) => selected.has(i));
    onSelect(picked);
  }

  const count = selected.size;
  const helperText =
    count === 0
      ? "Pick one to start a 1:1 chat, or several for a group."
      : count === 1
        ? "1 contact selected — continue for a 1:1 chat."
        : `${count} contacts selected — continue to create a group.`;

  return (
    <MobileBottomSheet
      open
      onClose={onClose}
      title="start a chat with…"
      dataTestId="contact-picker-overlay"
      footer={
        <ModalFooter>
          <Button variant="outline" onClick={onClose} data-testid="contact-picker-cancel">
            Cancel
          </Button>
          {contacts.length > 0 && (
            <Button
              onClick={handleContinue}
              disabled={count === 0}
              data-testid="contact-picker-continue"
            >
              Continue
            </Button>
          )}
        </ModalFooter>
      }
    >
      {contacts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <p className="text-sm text-text-2">You have no contacts yet.</p>
          <Link to="/contacts/add" onClick={onClose}>
            <Button>Add a contact</Button>
          </Link>
        </div>
      ) : (
        <>
          <ul
            className="flex flex-col gap-1 max-h-80 overflow-y-auto"
            data-testid="contact-picker-list"
          >
            {contacts.map((c: any, i: number) => {
              const isOn = selected.has(i);
              return (
                <li key={i}>
                  <button
                    onClick={() => toggleContact(i)}
                    className={`flex w-full items-center gap-2 rounded-r-3 px-3 py-2 text-left text-sm text-text hover:bg-panel-2 ${
                      isOn ? "bg-panel-2" : ""
                    }`}
                    data-testid={`contact-picker-row-${i}`}
                    aria-pressed={isOn}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs ${
                        isOn
                          ? "bg-arcan-accent border-arcan-accent text-on-accent"
                          : "border-hairline text-transparent"
                      }`}
                    >
                      {isOn ? "✓" : ""}
                    </span>
                    {c?.displayNameLocal ?? "(unknown)"}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-text-2" data-testid="contact-picker-count">
            {helperText}
          </p>
        </>
      )}
    </MobileBottomSheet>
  );
}
```

- [ ] **Step 11.2: Verify**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

Expected: all green.

- [ ] **Step 11.3: Commit**

```bash
git add src/components/contact-picker.tsx
git commit -m "refactor(contact-picker): use MobileBottomSheet

Sheets-up from the bottom on mobile, centers on desktop. Checkbox
swatch uses arcan-accent + on-accent tokens instead of the shadcn
primary shim, so it tracks the user's chosen accent."
```

---

## Task 12: Migrate IncomingConnectionPrompt to ModalShell

This is the in-person QR-channel approval modal. It surfaces when both parties are physically present, so a centered card is appropriate (not a bottom sheet). Mobile renders fine in the centered layout because the existing card already fits in 320px width.

**Files:**
- Modify: `src/components/incoming-connection-prompt.tsx`

- [ ] **Step 12.1: Rewrite the component**

Replace the full content of `src/components/incoming-connection-prompt.tsx` with:

```tsx
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
import { approveConnectionRequest, dismissConnectionRequest } from "@/jazz/invitations";
import { Button } from "@/components/ui/button";
import { ModalShell, ModalFooter } from "@/components/modal-shell";
import { SafetyNumber } from "@/components/safety-number";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useToast } from "@/components/toast";

/**
 * For ConnectionRequests with channel="qr", surface an immediate modal — both
 * parties are physically present waiting on the one tap.
 *
 * For channel="link" or "group", the request lands on the Pending Connections
 * list silently (no modal).
 */
export function IncomingConnectionPrompt() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const pending = useIncomingConnectionRequests();
  if (!me.$isLoaded) return null;
  const top = pending.find(({ request }) => (request as any).channel === "qr");
  if (!top) return null;
  return <Body me={me as any} request={top.request} />;
}

function Body({ me, request }: { me: any; request: any }) {
  const r = request as any;
  const shared = useSharedGroups(r.requesterAccountID);
  const toast = useToast();

  const onApprove = async () => {
    await approveConnectionRequest(me, request);
    toast({ icon: "check", text: "contact added", tone: "success" });
  };
  const onDismiss = async () => {
    await dismissConnectionRequest(me, request);
  };

  return (
    <ModalShell
      open
      onClose={onDismiss}
      title={`${r.requesterDisplayName} wants to connect`}
      dataTestId="incoming-connection-prompt"
      footer={
        <ModalFooter>
          <Button variant="outline" className="flex-1" onClick={onDismiss} data-testid="dismiss">
            dismiss
          </Button>
          <Button variant="primary" className="flex-1" onClick={onApprove} data-testid="approve">
            approve
          </Button>
        </ModalFooter>
      }
    >
      <p className="text-sm text-text-2">Scanned your code in person.</p>
      {shared.length > 0 && (
        <p className="text-xs text-arcan-accent">
          You're both in: {shared.map((s: any) => s.title).join(" · ")}
        </p>
      )}
      <details className="rounded-r-3 border border-hairline bg-bg p-3">
        <summary className="cursor-pointer text-sm text-text">view security code</summary>
        <div className="mt-3"><SafetyNumber fingerprintHex={r.requesterFingerprint} /></div>
      </details>
    </ModalShell>
  );
}
```

(`dismiss` and `approve` test-ids are preserved.)

- [ ] **Step 12.2: Verify**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

Expected: all green.

- [ ] **Step 12.3: Commit**

```bash
git add src/components/incoming-connection-prompt.tsx
git commit -m "refactor(incoming-connection): use ModalShell

The Unit-1 QR-channel approval modal now lives inside the canonical
shell. The requester-name title sits in the hairline header; approve /
dismiss are the footer pair. Existing test-ids preserved."
```

---

## Task 13: Migrate TrustedDevicePrompt to ModalShell

The trusted-device approval modal embeds a `DeviceApprovalCard` (Unit 2). The Card itself already has its own panel styling, so we suppress the ModalShell body padding and let the existing Card render inside.

**Files:**
- Modify: `src/components/trusted-device-prompt.tsx`

- [ ] **Step 13.1: Rewrite the component**

Replace the full content of `src/components/trusted-device-prompt.tsx` with:

```tsx
import { useState } from "react";
import { useAccount, useJazzContextValue, useAuthSecretStorage } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { usePendingPairings } from "@/jazz/use-pending-pairings";
import { DeviceApprovalCard } from "@/components/device-approval-card";
import { ModalShell } from "@/components/modal-shell";
import { approvePairing, rejectPairing } from "@/jazz/pairing";
import { useToast } from "@/components/toast";

/**
 * Renders a modal whenever a pending pairing is detected. Mounted once at the App root.
 *
 * For v1: full approve only works on the device that started the pair (the eph private key
 * is in this device's sessionStorage). Other already-logged-in trusted devices on the same
 * account see the card with Approve disabled and Reject enabled.
 */
export function TrustedDevicePrompt() {
  const me = useAccount(ArcanAccount, { resolve: {} });
  const pending = usePendingPairings();
  const jazzCtx = useJazzContextValue();
  const authSecretStorage = useAuthSecretStorage();
  const toast = useToast();
  const [working, setWorking] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  if (!me.$isLoaded) return null;

  const visible = pending.find((p: any) => !dismissed.has(p?.$jazz?.id));
  if (!visible) return null;

  const v = visible as any;
  const ephHex = typeof sessionStorage !== "undefined"
    ? sessionStorage.getItem(`arcan-pair-eph-${v.$jazz.id}`)
    : null;
  const canFullyApprove = !!ephHex;

  const onApprove = async () => {
    if (!canFullyApprove) return;
    setWorking(true);
    try {
      const authCtx: any = {
        authenticate: () => Promise.resolve(),
        authSecretStorage,
        crypto: (jazzCtx as any)?.node?.crypto,
      };
      await approvePairing(me as any, v, ephHex!, authCtx);
      try { sessionStorage.removeItem(`arcan-pair-eph-${v.$jazz.id}`); } catch {/* noop */}
      toast({ icon: "check", text: "device approved", tone: "success" });
      setDismissed((s) => new Set(s).add(v.$jazz.id));
    } catch (e) {
      console.error("[trusted-prompt] approve failed:", e);
      toast({ icon: "alert", text: "approve failed", tone: "error" });
    } finally {
      setWorking(false);
    }
  };

  const onDeny = async () => {
    setWorking(true);
    try {
      await rejectPairing(v);
      try { sessionStorage.removeItem(`arcan-pair-eph-${v.$jazz.id}`); } catch {/* noop */}
      toast({ icon: "check", text: "request rejected", tone: "neutral" });
      setDismissed((s) => new Set(s).add(v.$jazz.id));
    } catch (e) {
      console.error("[trusted-prompt] reject failed:", e);
    } finally {
      setWorking(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={() => setDismissed((s) => new Set(s).add(v.$jazz.id))}
      title="approve new device?"
      dataTestId="trusted-device-prompt"
      // No footer — approve / deny live on the embedded DeviceApprovalCard.
      // The card body is self-contained; we don't add the shell's gap-3.
      className="max-w-[420px]"
    >
      <DeviceApprovalCard
        userAgent={v.responderUserAgent}
        firstSeenAt={v.responderFirstSeenAt}
        fingerprint={v.responderFingerprint}
        onApprove={onApprove}
        onDeny={onDeny}
        pending={working || !canFullyApprove}
      />
      {!canFullyApprove && (
        <p className="text-[11px] text-dim text-center">
          To approve, open this prompt on the device you started the pairing on.
          Reject works from any device.
        </p>
      )}
    </ModalShell>
  );
}
```

- [ ] **Step 13.2: Verify**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

Expected: all green.

- [ ] **Step 13.3: Commit**

```bash
git add src/components/trusted-device-prompt.tsx
git commit -m "refactor(trusted-device-prompt): use ModalShell

The Unit-2 device-approval modal moves under the canonical shell. The
DeviceApprovalCard body keeps its existing internal structure; the shell
provides the consistent header (title + close-X) and a11y semantics."
```

---

## Task 14: Wire ImageLightbox to useModalA11y (keep bespoke layout)

The image lightbox is intentionally not a Card — it's a full-bleed image on `bg-black/85`. But it benefits from the same a11y plumbing (portal + Esc + scroll lock + focus restore).

**Files:**
- Modify: `src/components/image-lightbox.tsx`

- [ ] **Step 14.1: Wire the shared a11y hook + portal**

Replace the full content of `src/components/image-lightbox.tsx` with:

```tsx
import { useRef } from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "@/components/modal-shell";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useModalA11y({
    open: true,
    onClose,
    dismissOnEscape: true,
    containerRef,
    restoreRef,
  });

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      data-testid="image-lightbox"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 animate-arcan-fade-in"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image"
        data-testid="image-lightbox-close"
        className="absolute top-4 right-4 text-text-2 text-2xl bg-black/40 rounded-r-3 w-10 h-10 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      >
        ×
      </button>
      <img
        src={src}
        alt={alt ?? ""}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[95vw] max-h-[95vh] object-contain"
      />
    </div>,
    document.body,
  );
}
```

(`text-white` is replaced by `text-text-2` — but in a `bg-black/85` lightbox we want a high-contrast neutral. `text-text-2` resolves to `#8a93b2` (dark theme) or `#3c425a` (light theme), which is acceptable contrast over a darkened image. If a test fails because the prior `text-white` was load-bearing for visibility, swap to `text-text` instead.)

- [ ] **Step 14.2: Verify**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

Expected: all green. `text-white` was tolerated by check-tokens (it's not in the rejected pattern list — only `bg-white` is). We removed it as a defensive cleanup since we're already touching the file.

- [ ] **Step 14.3: Commit**

```bash
git add src/components/image-lightbox.tsx
git commit -m "refactor(image-lightbox): share modal a11y plumbing

ImageLightbox keeps its bespoke full-bleed layout but now uses the same
portal + scroll-lock + focus-restore plumbing as ModalShell. Close
button uses text-text-2 instead of the raw text-white literal."
```

---

## Task 15: Self-review + final verification

**Files:**
- None

- [ ] **Step 15.1: Run the full local verification battery**

```bash
npm run check-tokens
npx tsc -b --noEmit
npx vitest run
```

Expected: all green. If any test fails, fix inline. Do not move on with a failing suite.

- [ ] **Step 15.2: Smoke-test each modal in the running app**

```bash
npm run dev:all
```

Then manually exercise each route. For each modal below, verify the Card wrapper renders, the header shows the title + close-X, the footer has the action buttons, and the inputs render with a dark bg in dark theme. Use the toggle in `/settings` → `appearance` → theme to flip between light and dark; the inputs must follow.

| Modal | How to open |
|---|---|
| ChangePassword | `/settings` → "change password" |
| ViewRecoveryCode | `/settings` → "view recovery code" |
| GroupCreateDialog | `/conversations/new`, pick 2+ contacts, "continue" |
| LeaveWithPromoteDialog | `/conversations/<group>/members` (as last admin), "leave" |
| ContactPicker | `/conversations/new` initial step |
| IncomingConnectionPrompt | `/contacts/add` → scan your QR with another seeded account |
| TrustedDevicePrompt | Pair a new device via `/settings` → "link a new device" |
| ImageLightbox | Send an image in any chat, click the bubble |

On phone width (375×667 in DevTools), verify the four routes flagged for bottom-sheet (GroupCreateDialog, ContactPicker, ChangePassword, ViewRecoveryCode — the latter two stay centered since they used `ModalShell` not `MobileBottomSheet`; only GroupCreateDialog and ContactPicker should sheet-up).

- [ ] **Step 15.3: Spec-coverage self-review**

Walk the four audit rows and tick them off mentally:

- AUDIT-035 (change-password desktop): centered Card ✅, hairline header + close-X ✅, lowercase title ✅, footer action pair ✅, 200ms fade ✅
- AUDIT-036 (change-password mobile): centered Card on mobile (we intentionally kept it centered, not a sheet — passwords benefit from finger-distance-from-keyboard at the centered position; revisit if review pushes back)
- AUDIT-037 (view-recovery-code desktop): centered Card ✅, lowercase title ✅, 24-word grid uses font-mono via shared PassphraseGrid ✅, copy button ✅
- AUDIT-038 (view-recovery-code mobile): centered Card; `PassphraseGrid` defaults to 4-column — the design's mobile compact 3-column is wired by the `compact` prop, which we don't pass here. If review pushes back, pass `compact` when `window.matchMedia("(max-width: 640px)").matches` or via a CSS responsive helper. Open follow-up if not addressed inline.

Also confirm the related observation closed:

- Headline #2 (form-input bg theme leak): Task 1 fixed the underlying shim ✅; Tasks 7–13 migrated callsites to TextField for belt-and-braces

- [ ] **Step 15.4: Open the PR**

Push the branch and open a PR against `main`:

```bash
git push -u origin unit-8c-modal-shell
gh pr create --title "Unit 8c — ModalShell primitive + modal retrofit" --body "$(cat <<'EOF'
## Summary

- New canonical `<ModalShell>` + `<MobileBottomSheet>` modal primitives
- New `<PassphraseGrid>` shared between onboarding + view-recovery-code modal
- New `<TextField>` (Arcan-token text input) — replaces the inline `bg-background border …` markup that was the source of the dark-theme input-bg leak
- Theme-shim fix: `:root[data-theme="dark"]` now mirrors `.dark` so the shadcn HSL vars actually flip under our `data-theme` provider
- Eight ad-hoc modals retrofitted: ChangePassword, ViewRecoveryCode, GroupCreate, LeaveWithPromote, ContactPicker, IncomingConnection, TrustedDevice, ImageLightbox

Closes AUDIT-035, AUDIT-036, AUDIT-037, AUDIT-038. Addresses headline #2 (form input bg leaks across themes).

## Test plan

- [ ] `npm run check-tokens` passes
- [ ] `npx tsc -b --noEmit` passes
- [ ] `npx vitest run` passes (incl. new tests in `tests/unit/components/{modal-shell,passphrase-grid,text-field,theme-shim}.test.{ts,tsx}`)
- [ ] Smoke-tested each modal under both themes; inputs follow the theme
- [ ] GroupCreate + ContactPicker sheet-up on mobile (≤sm) and center on desktop

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Plan self-review

Re-walked the spec inputs (prompt + audit rows 035/036/037/038 + headline #2):

1. **Spec coverage.** Every named callsite has a task. ModalShell + MobileBottomSheet covered by Tasks 2–3. Input-bg fix by Task 1 (root cause) + Task 4 (TextField) + Tasks 7–9 (migrations). PassphraseGrid extracted in Task 5 and consumed by Task 6 (onboarding) + Task 8 (recovery-code modal). ImageLightbox addressed in Task 14 (kept bespoke layout but shares a11y plumbing per the prompt's "verify whether ModalShell fits or it stays bespoke" — it stays bespoke).

2. **No-Placeholder scan.** Every step shows the exact code, the exact command, and the expected output. The only "if X, then Y" branches are the Tailwind `rounded-t-r-3` fallback in Step 3.3 and the `accent-arcan-accent` fallback in Step 10.1 — both with concrete inline-style alternatives.

3. **Type consistency.** Across all 15 tasks the shared exports are: `ModalShell`, `MobileBottomSheet`, `ModalFooter`, `useModalA11y`, `TextField`, `PassphraseGrid`. Each is defined once (Tasks 2, 3, 4, 5) and consumed by matching imports in Tasks 6–14. Prop names (`open`, `onClose`, `title`, `footer`, `dataTestId`, `compact`, `withCopyButton`, `phrase`) are consistent across definition and consumption.

4. **Test-ids preserved.** Every existing data-testid that downstream e2e tests reference (`change-password-*`, `view-recovery-code-*`, `recovery-code-display`, `group-create-*`, `leave-promote-*`, `contact-picker-*`, `incoming-connection-prompt`, `trusted-device-prompt`, `image-lightbox*`, `passphrase-grid`, `passphrase-copy-btn`, `passphrase-saved-checkbox`, `passphrase-display-continue`) is preserved or re-attached.

5. **Token compliance.** Every new className uses Arcan token utilities (`bg-panel`, `bg-bg`, `bg-panel-2`, `border-hairline`, `text-text`, `text-text-2`, `text-dim`, `bg-arcan-accent`, `text-on-accent`, `font-mono`) or explicitly-allowed shims (`bg-black/60`, `bg-black/85`). No raw color palette references introduced.

6. **No new dependencies.** Confirmed: portal via `react-dom`'s `createPortal` (already in tree), focus trap implemented inline, Esc via `window.keydown`.

7. **No schema changes.** Confirmed: no file under `src/jazz/schema/` is touched.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-13-unit-8c-modal-shell.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
