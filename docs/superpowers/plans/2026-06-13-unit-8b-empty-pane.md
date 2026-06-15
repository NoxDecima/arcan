# Unit 8b · EmptyPane + Lattice placement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new shared `<EmptyPane>` primitive that gives the desktop reading-pane and the compact empty hint surfaces the cosmic Lattice-watermark treatment from the design, then wire it into the four empty surfaces (`/` reading pane, sidebar contacts tab, `/contacts`, `/connections/pending`, `/connections/live-invites`) and place the `Lattice` mark in the sidebar header (the "app header" on initial paint) so the brand mark stops being a built-but-unused component.

**Architecture:** One new file `src/components/empty-pane.tsx` exposing a single `<EmptyPane>` component with a `variant` prop (`"reading-pane" | "compact"`). The reading-pane variant fills its parent with a `bg-bg` (or `bg-gradient-cosmic`) backdrop, an oversized `<Lattice size={360} mono>` bleeding off the bottom-right corner at very low opacity, three scattered cosmic dot accents at fixed positions, a centered medium Lattice (size 58) above the title, the `title` line, and the `description` line. The compact variant is a smaller centered stack: `<Lattice size={48}>` watermark + title + description + optional CTA slot. Both variants are theme- and accent-aware via existing tokens. The component is purely presentational — no state, no data dependencies — so it drops into any container that gives it bounded height. Call-sites replace the existing inline `EmptyState` / plain `<p>` / `<div>` empty hints. The sidebar header (Lattice placement) gains a small `<Lattice size={22}>` adjacent to the display name, satisfying the audit note that the mark exists but isn't surfaced anywhere in the chrome.

**Tech Stack:** React 18, TypeScript strict, Tailwind v3 utilities (token-mapped class names per `tailwind.config.ts`), the existing `Lattice` component (`src/components/lattice.tsx`), the existing `Button` shadcn primitive (`src/components/ui/button`), Vitest + React Testing Library for unit tests.

**Spec context:**
- Unit 8 design: `docs/superpowers/specs/2026-06-13-unit-8-final-alignment-design.md`
- Unit 8 Phase A audit (closes rows AUDIT-007, 008, 019, 020, 029, 030, 031, 032):
  `docs/superpowers/specs/2026-06-13-unit-8-audit.md`
- Reference scenes: `design/hf-list.jsx#EmptyPane` (lines 5–24 — canonical render shape),
  `design/hf-contacts.jsx` (line 49 — "select a contact" variant), `design/hf-chat.jsx`
  (referenced from AUDIT-007), `design/Jazz Hi-Fi App.html`
- Prep · Tokens plan: `docs/superpowers/plans/2026-06-13-unit-8-prep-tokens.md` —
  defines `--gradient-cosmic` + `bg-gradient-cosmic` Tailwind utility. This plan
  uses the utility when present; if Prep · Tokens has not merged when this plan
  executes, the reading-pane variant falls back to plain `bg-bg` (the cosmic
  watermark comes from Lattice + dot sprinkles either way, per the audit's
  "or replicated by Lattice + dot sprinkles per current Lattice component"
  note). Task 3.4 covers the conditional and the fallback.

---

## Reference: the design's EmptyPane render shape

From `design/hf-list.jsx` lines 5–24 (canonical):

```jsx
function EmptyPane({ s, title = 'pick a conversation', sub = 'or start a new one — end-to-end encrypted' }) {
  const c = s.c;
  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 18, background: c.bg,
                  overflow: 'hidden' }}>
      {/* cosmic watermark — pale oversized Arcan mark bleeding off the corner */}
      <svg width="360" height="360" viewBox="0 0 100 100" aria-hidden="true"
        style={{ position: 'absolute', right: -84, bottom: -96, color: c.text,
                 opacity: s.theme === 'dark' ? 0.05 : 0.06, userSelect: 'none',
                 pointerEvents: 'none' }}
        dangerouslySetInnerHTML={{ __html: (window.LATTICE ? window.LATTICE.full('currentColor') : '') }} />
      {/* cosmic dots (Nox motif) */}
      <div style={{ position: 'absolute', right: '22%', top: '24%', width: 4, height: 4,
                    borderRadius: 4, background: c.accentFill,
                    boxShadow: `0 0 10px ${alpha(c.accentFill, .6)}` }} />
      <div style={{ position: 'absolute', left: '24%', bottom: '28%', width: 3, height: 3,
                    borderRadius: 3, background: '#bb9af7', opacity: .7 }} />
      <div style={{ position: 'absolute', left: '40%', top: '30%', width: 2, height: 2,
                    borderRadius: 2, background: c.dim }} />
      <ArcanMark s={s} size={58} stacked />
      <div style={{ textAlign: 'center', position: 'relative' }}>
        <div style={{ font: `600 16px/1.3 ${...}`, color: c.text }}>{title}</div>
        <div style={{ marginTop: 6, font: `400 12px/1.4 ${s.body}`, color: c.text2 }}>{sub}</div>
      </div>
    </div>
  );
}
```

Live mapping (token-aware):
- `c.bg` → `bg-bg` Tailwind utility (or `bg-gradient-cosmic` when Prep · Tokens has landed)
- `c.text` watermark → `text-text` parent + `<Lattice mono>` (the component uses
  `currentColor` when `mono` is passed)
- `opacity 0.05 (dark) / 0.06 (light)` → `opacity-[0.05] dark:opacity-[0.05]`. The
  Tailwind config does not surface a token-mapped opacity scale, but raw `opacity-[*]`
  arbitrary values do not trip `scripts/check-tokens.sh` (which only flags
  ad-hoc `bg-` / `text-` / `border-` color literals — see the regex at
  `scripts/check-tokens.sh:12`). Confirm with `npm run check-tokens` after Task 1.2.
- `c.accentFill` glow dot → `bg-arcan-accent` (the Tailwind utility for
  `--color-accent`, per `tailwind.config.ts:62`)
- `'#bb9af7'` literal violet dot → kept as a raw token reference via the
  `--color-accent-grad-1` CSS var (which is `#bb9af7` for the default tokyo
  accent and shifts per-accent — strictly more accent-respecting than the
  hardcoded literal). Renders via inline `style={{ background: 'var(--color-accent-grad-1)' }}`
  — inline style does not trigger the check-tokens guard (the guard only matches
  Tailwind class strings).
- `c.dim` faintest dot → `bg-dim`
- `<ArcanMark size={58} stacked />` centered → live's `<Lattice size={58} />`
  (live `Lattice` does not have a `stacked` prop; the design's `stacked` adds a
  wordmark under the mark, which our `Lattice` does not implement. Drop the
  wordmark; the mark alone matches the empty-pane intent. The wordmark
  treatment is owned by 8a · AuthSurface where a full lockup is appropriate.)
- title typography → `text-base font-semibold text-text` (16px ≈ Tailwind `text-base`)
- description typography → `text-xs text-text-2 mt-1.5` (12px ≈ Tailwind `text-xs`)

`design/hf-contacts.jsx:49` uses the same component with different copy:
`<EmptyPane s={s} title="select a contact" sub="choose a contact to see their profile" />`.

---

## File Structure

Six files touched (one created, five modified):

- **Create:** `src/components/empty-pane.tsx` — the shared primitive. Single
  default export `EmptyPane` plus `EmptyPaneProps` type. Two variants behind a
  discriminated `variant` prop. ~110 lines.
- **Create:** `tests/unit/components/empty-pane.test.tsx` — unit tests covering
  both variants, the Lattice presence, and the CTA slot.
- **Modify:** `src/routes/conversations/index.tsx` — swap `EmptyState` for
  `<EmptyPane variant="reading-pane">`.
- **Modify:** `src/routes/contacts/index.tsx` — swap the inline `<div
  data-testid="contacts-empty">…` block for `<EmptyPane variant="compact">`
  with a CTA wired to `/contacts/add`.
- **Modify:** `src/routes/connections/pending.tsx` — swap the inline
  `<p>No pending requests.</p>` for `<EmptyPane variant="compact">`.
- **Modify:** `src/routes/connections/live-invites.tsx` — swap the inline
  `<p>No active invites.</p>` for `<EmptyPane variant="compact">` with a
  primary "create invitation" CTA wired to `/contacts/add` (per AUDIT-031
  delta: "Add a primary 'create invitation' CTA per Unit 1 spec.").
- **Modify:** `src/components/sidebar.tsx` —
  (a) replace the contacts-tab empty hint inline `<div className="p-4
  text-center space-y-3">…` with `<EmptyPane variant="compact">`;
  (b) add `<Lattice size={22} className="flex-shrink-0" />` adjacent to the
  display name in the sidebar header (the "app header" placement per the
  audit's "Lattice placement — the component is built but unused" note).

`src/components/empty-state.tsx` is intentionally left in place — no other
call-sites consume it (verified at plan-write time via `grep -rn "EmptyState\|empty-state" src/` — only `conversations/index.tsx` imports it). It becomes
dead code as of this plan's Task 5.1 commit. Removal is deferred to Unit 8f or
a follow-up: deleting the file plus its test in this plan is in-scope cleanup,
done after all consumers migrate.

---

## Phase 0 · Setup

### Task 0.1: Create + check out the branch

- [ ] **Step 1: Verify clean working tree on `main`**

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

Expected: working tree shows only the untracked `.claude/`, `ArcanUI.zip`,
`playwright.visual.config.ts`, `tests/visual/` entries (these are intentional
local-only state); current branch is `main`; HEAD is `f3187a2` (the Phase A
audit merge — matches the brief).

- [ ] **Step 2: Create + check out `unit-8b-empty-pane` off `main`**

```bash
git checkout -b unit-8b-empty-pane
```

Expected: `Switched to a new branch 'unit-8b-empty-pane'`.

- [ ] **Step 3: Verify the design reference is present locally**

```bash
ls design/hf-list.jsx design/hf-contacts.jsx design/hf-chat.jsx
```

Expected: all three files exist. If not, re-extract from `ArcanUI.zip`:

```bash
python3 -c "import zipfile; zipfile.ZipFile('ArcanUI.zip').extractall('design/')"
```

- [ ] **Step 4: Verify the baseline test suite is green**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

Expected: all three commands exit 0. If any fail on a clean checkout of
`main`, stop and surface the failure — this plan assumes a green baseline.

(No commit — this is verification only.)

---

## Phase 1 · The `EmptyPane` primitive

### Task 1.1: Write the failing tests for `<EmptyPane>`

**Files:**
- Create: `tests/unit/components/empty-pane.test.tsx`

- [ ] **Step 1: Write the failing test file**

Write the file with this exact content:

```tsx
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyPane } from "@/components/empty-pane";

describe("<EmptyPane variant='reading-pane'>", () => {
  test("renders the title and description", () => {
    render(
      <EmptyPane
        variant="reading-pane"
        title="select a conversation"
        description="or start a new one — end-to-end encrypted"
      />,
    );
    expect(screen.getByText("select a conversation")).toBeInTheDocument();
    expect(
      screen.getByText("or start a new one — end-to-end encrypted"),
    ).toBeInTheDocument();
  });

  test("renders two Lattice SVGs: the oversized watermark + the centered mark", () => {
    const { container } = render(
      <EmptyPane
        variant="reading-pane"
        title="select a conversation"
        description="…"
      />,
    );
    const svgs = container.querySelectorAll("svg[aria-label='Arcan']");
    expect(svgs.length).toBe(2);
  });

  test("the oversized watermark is hidden from the a11y tree", () => {
    const { container } = render(
      <EmptyPane
        variant="reading-pane"
        title="select a conversation"
        description="…"
      />,
    );
    // The wrapper that holds the oversized Lattice carries aria-hidden so
    // screen readers don't double-announce the brand mark.
    const watermark = container.querySelector("[data-empty-pane-watermark]");
    expect(watermark).not.toBeNull();
    expect(watermark?.getAttribute("aria-hidden")).toBe("true");
  });

  test("title renders as a heading for landmark navigation", () => {
    render(
      <EmptyPane
        variant="reading-pane"
        title="select a conversation"
        description="…"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "select a conversation" }),
    ).toBeInTheDocument();
  });

  test("renders an optional data-testid passthrough", () => {
    const { container } = render(
      <EmptyPane
        variant="reading-pane"
        title="t"
        description="d"
        data-testid="my-empty"
      />,
    );
    expect(container.querySelector('[data-testid="my-empty"]')).not.toBeNull();
  });
});

describe("<EmptyPane variant='compact'>", () => {
  test("renders the title and description", () => {
    render(
      <EmptyPane
        variant="compact"
        title="no contacts yet"
        description="invite someone via a QR code or share link."
      />,
    );
    expect(screen.getByText("no contacts yet")).toBeInTheDocument();
    expect(
      screen.getByText("invite someone via a QR code or share link."),
    ).toBeInTheDocument();
  });

  test("renders exactly one Lattice mark (no oversized watermark)", () => {
    const { container } = render(
      <EmptyPane variant="compact" title="t" description="d" />,
    );
    const svgs = container.querySelectorAll("svg[aria-label='Arcan']");
    expect(svgs.length).toBe(1);
  });

  test("renders an optional CTA via the cta prop", () => {
    render(
      <EmptyPane
        variant="compact"
        title="no contacts yet"
        description="…"
        cta={<button data-testid="my-cta">add a contact</button>}
      />,
    );
    expect(screen.getByTestId("my-cta")).toBeInTheDocument();
  });

  test("omits the CTA wrapper when no cta prop is given", () => {
    const { container } = render(
      <EmptyPane variant="compact" title="t" description="d" />,
    );
    expect(
      container.querySelector("[data-empty-pane-cta]"),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test file and verify it fails for the right reason**

```bash
npx vitest run tests/unit/components/empty-pane.test.tsx
```

Expected: every test FAILs with an error like `Failed to resolve import "@/components/empty-pane"` (the file doesn't exist yet).

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/unit/components/empty-pane.test.tsx
git commit -m "test(empty-pane): add failing tests for EmptyPane primitive"
```

### Task 1.2: Implement `EmptyPane`

**Files:**
- Create: `src/components/empty-pane.tsx`

- [ ] **Step 1: Write the component**

Write `src/components/empty-pane.tsx` with this exact content:

```tsx
import type { ReactNode } from "react";
import { Lattice } from "@/components/lattice";

/**
 * EmptyPane: the canonical "nothing selected / nothing to show" placeholder.
 *
 * Two variants:
 *   - "reading-pane" — fills the desktop reading-pane on `/` when no
 *     conversation is selected. Oversized Lattice watermark bleeds off the
 *     bottom-right corner; three scattered cosmic dots; centered medium
 *     Lattice mark above the title + description.
 *   - "compact" — smaller centered stack for empty list states (contacts,
 *     connections/pending, connections/live-invites). Small Lattice +
 *     title + description + optional CTA.
 *
 * Design reference: `design/hf-list.jsx` lines 5–24 (canonical render shape).
 * Audit rows closed: AUDIT-007, 008, 019, 020, 029, 030, 031, 032.
 */

type CommonProps = {
  title: string;
  description: string;
  /** Optional passthrough for e2e / unit test hooks. */
  "data-testid"?: string;
};

type ReadingPaneProps = CommonProps & {
  variant: "reading-pane";
};

type CompactProps = CommonProps & {
  variant: "compact";
  /**
   * Optional CTA rendered below the description. Pass any React node — most
   * call-sites pass a `<Button>` or `<Link>` wrapped Button.
   */
  cta?: ReactNode;
};

export type EmptyPaneProps = ReadingPaneProps | CompactProps;

export function EmptyPane(props: EmptyPaneProps) {
  if (props.variant === "reading-pane") {
    return <ReadingPaneVariant {...props} />;
  }
  return <CompactVariant {...props} />;
}

function ReadingPaneVariant({
  title,
  description,
  "data-testid": testid,
}: ReadingPaneProps) {
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center gap-[18px] overflow-hidden bg-bg"
      data-testid={testid}
    >
      {/* Oversized Lattice watermark, bleeding off the bottom-right corner.
          Pale opacity per design. Wrapped in an aria-hidden span so screen
          readers don't double-announce the brand mark (the centered Lattice
          below carries its own aria-label="Arcan"). */}
      <span
        data-empty-pane-watermark
        aria-hidden="true"
        className="pointer-events-none absolute select-none text-text opacity-[0.05]"
        style={{ right: -84, bottom: -96 }}
      >
        <Lattice size={360} mono />
      </span>

      {/* Cosmic dots — Nox motif. Positioned per design/hf-list.jsx. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-1 w-1 rounded-pill bg-arcan-accent"
        style={{
          right: "22%",
          top: "24%",
          boxShadow: "0 0 10px var(--color-accent-soft)",
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-[3px] w-[3px] rounded-pill opacity-70"
        style={{
          left: "24%",
          bottom: "28%",
          background: "var(--color-accent-grad-1)",
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-[2px] w-[2px] rounded-pill bg-dim"
        style={{ left: "40%", top: "30%" }}
      />

      {/* Centered medium Lattice mark. Default (non-mono) so it picks up the
          user's accent gradient. */}
      <Lattice size={58} />

      <div className="relative text-center">
        <h2 className="text-base font-semibold text-text">{title}</h2>
        <p className="mt-1.5 text-xs text-text-2">{description}</p>
      </div>
    </div>
  );
}

function CompactVariant({
  title,
  description,
  cta,
  "data-testid": testid,
}: CompactProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center"
      data-testid={testid}
    >
      <Lattice size={48} />
      <div>
        <h2 className="text-base font-semibold text-text">{title}</h2>
        <p className="mt-1.5 max-w-xs text-xs text-text-2">{description}</p>
      </div>
      {cta && <div data-empty-pane-cta className="mt-2">{cta}</div>}
    </div>
  );
}
```

Notes for the implementer:
- `rounded-pill` is `var(--r-pill)` (= `999px`) per `tailwind.config.ts:80`.
- The inline `style` references to `var(--color-accent-grad-1)` and
  `var(--color-accent-soft)` use CSS custom properties already declared in
  `src/styles/tokens.css`. Inline style is intentional: there is no Tailwind
  utility mapped to those vars, and the check-tokens guard only inspects
  class strings (see `scripts/check-tokens.sh:12`), so this passes the guard
  cleanly.
- The arbitrary opacity `opacity-[0.05]` is a Tailwind v3 arbitrary value;
  the guard regex does not match it.

- [ ] **Step 2: Run the tests and verify they pass**

```bash
npx vitest run tests/unit/components/empty-pane.test.tsx
```

Expected: all nine tests PASS.

- [ ] **Step 3: Run the token guard**

```bash
npm run check-tokens
```

Expected: `✓ no ad-hoc Tailwind color/typography classes detected`. If the
guard fails, inspect the failing class and either route it through a token
mapping in `tailwind.config.ts` or move it to an inline `style` referencing
the underlying CSS var.

- [ ] **Step 4: Run TypeScript build**

```bash
npx tsc -b --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/empty-pane.tsx
git commit -m "feat(empty-pane): add shared EmptyPane primitive (reading-pane + compact variants)"
```

---

## Phase 2 · Wire EmptyPane into call-sites

### Task 2.1: Reading-pane variant on `/` (conversations empty)

**Files:**
- Modify: `src/routes/conversations/index.tsx`

This closes AUDIT-007 (desktop) and AUDIT-008 (mobile inherits the deltas).

- [ ] **Step 1: Open the file and read the current state**

```bash
cat src/routes/conversations/index.tsx
```

Current content (recorded at plan-write time):

```tsx
import { Sidebar } from "@/components/sidebar";
import { EmptyState } from "@/components/empty-state";

export function ConversationsRoute() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="hidden md:flex flex-1" data-testid="home-main">
        <div data-testid="conversations-main" className="h-full w-full">
          <EmptyState
            title="Select a conversation"
            description="Choose a conversation from the sidebar, or start a new one with the + button."
          />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Replace the contents with the EmptyPane wiring**

Overwrite the file with:

```tsx
import { Sidebar } from "@/components/sidebar";
import { EmptyPane } from "@/components/empty-pane";

/**
 * The desktop reading-pane shown at `/` when no conversation is selected.
 * Renders the sidebar + the cosmic EmptyPane (oversized Lattice watermark,
 * scattered cosmic dots, centered hint). Hidden on mobile — mobile shows
 * the conversation list full-width with the bottom tab bar.
 *
 * Audit rows closed: AUDIT-007, AUDIT-008.
 */
export function ConversationsRoute() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="hidden md:flex flex-1" data-testid="home-main">
        <div data-testid="conversations-main" className="h-full w-full">
          <EmptyPane
            variant="reading-pane"
            title="select a conversation"
            description="or start a new one — end-to-end encrypted"
          />
        </div>
      </main>
    </div>
  );
}
```

Copy mirrors `design/hf-list.jsx:5` defaults (lowercase, "select a
conversation" / "or start a new one — end-to-end encrypted").

- [ ] **Step 3: Run the relevant tests**

```bash
npx vitest run tests/unit/components/empty-pane.test.tsx tests/unit/routes 2>/dev/null
npx tsc -b --noEmit
npm run check-tokens
```

Expected: empty-pane tests PASS; `tsc` exits 0; check-tokens exits 0. (The
`tests/unit/routes` glob may include zero or more files depending on what's
been added to the suite over time — both are fine.)

- [ ] **Step 4: Commit**

```bash
git add src/routes/conversations/index.tsx
git commit -m "feat(conversations): swap EmptyState for cosmic EmptyPane on desktop reading-pane (AUDIT-007/008)"
```

### Task 2.2: Compact variant on `/contacts` empty

**Files:**
- Modify: `src/routes/contacts/index.tsx`

This closes AUDIT-019 (desktop) and AUDIT-020 (mobile inherits).

- [ ] **Step 1: Locate the empty branch**

The current empty branch (lines 79–88) is:

```tsx
{contacts.length === 0 ? (
  <div
    className="text-center py-12 text-muted-foreground"
    data-testid="contacts-empty"
  >
    <p>No contacts yet.</p>
    <p className="text-xs mt-2">
      Add your first contact via the + Add contact button.
    </p>
  </div>
) : (
```

- [ ] **Step 2: Add the EmptyPane import at the top of the file**

Add this import line below the existing imports (insert after the `import { resolveAvatarFileBlob, useRemoteAvatar } from "@/jazz/avatarResolver";` line):

```tsx
import { EmptyPane } from "@/components/empty-pane";
```

- [ ] **Step 3: Replace the empty branch**

Use Edit tool to swap the old empty block for:

```tsx
{contacts.length === 0 ? (
  <EmptyPane
    variant="compact"
    title="no contacts yet"
    description="add your first contact via a QR code or share link."
    cta={
      <Link to="/contacts/add">
        <Button data-testid="add-contact-empty-cta">add a contact</Button>
      </Link>
    }
    data-testid="contacts-empty"
  />
) : (
```

Rationale for keeping `data-testid="contacts-empty"`: the audit's anchor
selector is preserved so future capture runs find the same element. The
nested CTA gets its own testid for e2e suites that want to click it.

- [ ] **Step 4: Verify**

```bash
npx vitest run tests/unit/components/empty-pane.test.tsx
npx tsc -b --noEmit
npm run check-tokens
```

Expected: PASS / 0 / 0.

- [ ] **Step 5: Commit**

```bash
git add src/routes/contacts/index.tsx
git commit -m "feat(contacts): compact EmptyPane on /contacts empty state (AUDIT-019/020)"
```

### Task 2.3: Compact variant on `/connections/pending` empty

**Files:**
- Modify: `src/routes/connections/pending.tsx`

This closes AUDIT-029 (desktop) and AUDIT-030 (mobile inherits).

- [ ] **Step 1: Add the EmptyPane import**

Add this import line below the existing imports (after the `import { useToast } from "@/components/toast";` line):

```tsx
import { EmptyPane } from "@/components/empty-pane";
```

- [ ] **Step 2: Replace the empty branch**

The current empty branch (lines 17–19) is:

```tsx
{pending.length === 0 ? (
  <p className="text-sm text-text-2">No pending requests.</p>
) : (
```

Swap it for:

```tsx
{pending.length === 0 ? (
  <EmptyPane
    variant="compact"
    title="no pending requests"
    description="when someone scans your code or follows your invite link, their request will land here."
    data-testid="pending-empty"
  />
) : (
```

No CTA — the user reaches this surface by intent, not by needing to take
the next action. (Per AUDIT-029: the row only flags the visual treatment;
the row's `proposed_action` is "sub-unit 8b (EmptyPane)" with no CTA
asterisk.)

- [ ] **Step 3: Verify**

```bash
npx vitest run tests/unit/components/empty-pane.test.tsx
npx tsc -b --noEmit
npm run check-tokens
```

Expected: PASS / 0 / 0.

- [ ] **Step 4: Commit**

```bash
git add src/routes/connections/pending.tsx
git commit -m "feat(connections): compact EmptyPane on /connections/pending empty (AUDIT-029/030)"
```

### Task 2.4: Compact variant on `/connections/live-invites` empty

**Files:**
- Modify: `src/routes/connections/live-invites.tsx`

This closes AUDIT-031 (desktop) and AUDIT-032 (mobile inherits). AUDIT-031's
delta explicitly requests a primary "create invitation" CTA.

- [ ] **Step 1: Add the EmptyPane + Link imports**

Add these import lines below the existing imports:

```tsx
import { Link } from "react-router-dom";
import { EmptyPane } from "@/components/empty-pane";
```

- [ ] **Step 2: Replace the empty branch**

The current empty branch (lines 21–23) is:

```tsx
{active.length === 0 ? (
  <p className="text-sm text-text-2">No active invites.</p>
) : (
```

Swap it for:

```tsx
{active.length === 0 ? (
  <EmptyPane
    variant="compact"
    title="no active invites"
    description="create a QR code or share link to invite someone to connect."
    cta={
      <Link to="/contacts/add">
        <Button data-testid="create-invite-empty-cta">create invitation</Button>
      </Link>
    }
    data-testid="live-invites-empty"
  />
) : (
```

The CTA points at `/contacts/add` because that route is where the user
creates an invitation in the current app (per Unit 1's invitation flow — QR
+ share-link UI both live there). If a dedicated `/connections/new` route
ships in a later unit, that's the migration target; for now `/contacts/add`
is the correct endpoint.

- [ ] **Step 3: Verify**

```bash
npx vitest run tests/unit/components/empty-pane.test.tsx
npx tsc -b --noEmit
npm run check-tokens
```

Expected: PASS / 0 / 0.

- [ ] **Step 4: Commit**

```bash
git add src/routes/connections/live-invites.tsx
git commit -m "feat(connections): compact EmptyPane + create-invitation CTA on /connections/live-invites empty (AUDIT-031/032)"
```

### Task 2.5: Compact variant in the sidebar contacts tab empty

**Files:**
- Modify: `src/components/sidebar.tsx`

The sidebar's contacts-tab empty branch is the same visual family as
`/contacts` empty but rendered inside a 256px-wide column. The compact
variant fits fine — `gap-3 px-4 py-12` works inside `w-64`.

- [ ] **Step 1: Add the EmptyPane import**

Add this line at the top of `src/components/sidebar.tsx` next to the
existing component imports (after the `import { resolveAvatarFileBlob,
useRemoteAvatar } from "@/jazz/avatarResolver";` line):

```tsx
import { EmptyPane } from "@/components/empty-pane";
```

- [ ] **Step 2: Replace the contacts-tab empty branch**

The current empty branch (lines 308–316) is:

```tsx
{contacts.length === 0 ? (
  <div className="p-4 text-center space-y-3">
    <p className="text-sm text-muted-foreground">No contacts yet.</p>
    <Link to="/contacts/add">
      <Button size="sm" variant="outline">
        Add a contact
      </Button>
    </Link>
  </div>
) : (
```

Swap it for:

```tsx
{contacts.length === 0 ? (
  <EmptyPane
    variant="compact"
    title="no contacts yet"
    description="invite someone with a QR code or share link."
    cta={
      <Link to="/contacts/add">
        <Button size="sm" variant="outline">add a contact</Button>
      </Link>
    }
    data-testid="sidebar-contacts-empty"
  />
) : (
```

- [ ] **Step 3: Replace the chats-tab empty branch with the compact variant too**

The chats-tab empty branch (lines 245–255) currently is:

```tsx
{sortedActive.length === 0 ? (
  <div className="p-4 text-center space-y-3">
    <p className="text-sm text-muted-foreground">No conversations yet.</p>
    <Button
      size="sm"
      variant="outline"
      onClick={() => setTab("contacts")}
    >
      Browse contacts
    </Button>
  </div>
) : (
```

The audit didn't flag this branch directly (its rows for the chats sidebar
are CAPTURE DEFERRED — AUDIT-009/010 with multi-account fixture pending),
but the visual treatment family is identical to the contacts-tab empty.
Swap it for the same compact variant to keep both tabs visually consistent:

```tsx
{sortedActive.length === 0 ? (
  <EmptyPane
    variant="compact"
    title="no conversations yet"
    description="start a chat with one of your contacts."
    cta={
      <Button
        size="sm"
        variant="outline"
        onClick={() => setTab("contacts")}
      >
        browse contacts
      </Button>
    }
    data-testid="sidebar-chats-empty"
  />
) : (
```

- [ ] **Step 4: Verify**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

Expected: all tests PASS; tsc exits 0; check-tokens exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(sidebar): compact EmptyPane on chats + contacts tab empty states"
```

---

## Phase 3 · Lattice placement in the sidebar header

The audit's headline-observations section calls out that `Lattice` is built
but unused in the chrome. The design's sidebar header (`design/hf-chat.jsx`
NavColumn lines 39–43) doesn't show a Lattice — it shows the user's avatar +
display name + gear icon. But Phase B's sub-unit 8b explicitly lists "app
header" as one of its three deliverables (`final-alignment-design.md:156`,
"finalize Lattice placement in app header"). The reading of that brief is:
on initial paint, before the user has selected any conversation, the brand
mark should be present in the chrome at small size so the app's identity is
visible even when no content is loaded.

Resolution: add a small `<Lattice size={22}>` adjacent to the display name
in the sidebar header (alongside the avatar). This is purely additive — the
profile-button tap target stays the same, and the Lattice does not interfere
with the existing `data-testid="sidebar-header-profile"` hook.

### Task 3.1: Add Lattice to the sidebar header

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add the Lattice import**

Add this line next to the other component imports at the top of
`src/components/sidebar.tsx`:

```tsx
import { Lattice } from "@/components/lattice";
```

(If you already added `EmptyPane` in Task 2.5, add `Lattice` adjacent to
it.)

- [ ] **Step 2: Insert the Lattice in the header row**

The current header row (lines 175–209) starts with:

```tsx
{/* Header: avatar + display name + new chat button */}
<div className="p-4 border-b border-hairline flex items-center justify-between gap-2">
  <button
    type="button"
    data-testid="sidebar-header-profile"
    data-account-id={myID}
    onClick={() => myID && navigate(`/profile/${myID}`)}
    className="flex items-center gap-2 min-w-0 text-left hover:opacity-90"
    aria-label="Open your profile"
  >
    <Avatar ... />
    <span data-testid="sidebar-display-name" ...>
      {me.profile.displayName}
    </span>
  </button>
  <Button ... >+</Button>
</div>
```

Insert a `<Lattice size={22} className="flex-shrink-0" />` immediately
**before** the `<button …data-testid="sidebar-header-profile">` opening tag,
so the Lattice sits outside the profile-tap target (the brand mark is
chrome, not a profile button affordance):

```tsx
{/* Header: Lattice brand mark + avatar/profile button + new chat button */}
<div className="p-4 border-b border-hairline flex items-center justify-between gap-2">
  <Lattice size={22} className="flex-shrink-0" />
  <button
    type="button"
    data-testid="sidebar-header-profile"
    data-account-id={myID}
    onClick={() => myID && navigate(`/profile/${myID}`)}
    className="flex items-center gap-2 min-w-0 text-left hover:opacity-90 flex-1"
    aria-label="Open your profile"
  >
    <Avatar ... />
    <span data-testid="sidebar-display-name" ...>
      {me.profile.displayName}
    </span>
  </button>
  <Button ... >+</Button>
</div>
```

The `flex-1` added to the profile button preserves the space distribution
(the Lattice takes its natural 22px, the profile button takes the rest, the
`+` button stays right-aligned). The `justify-between` on the parent row is
fine — flex-1 on the middle child overrides distribution.

- [ ] **Step 3: Run the test suite and the guard**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

Expected: all tests PASS; tsc exits 0; check-tokens exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(sidebar): place Lattice brand mark in sidebar header (initial-paint chrome)"
```

### Task 3.2: Verify visual via the dev server (manual spot-check)

This step is a manual visual spot-check — it does not gate the commit.

- [ ] **Step 1: Enter the nix shell**

```bash
nix-shell
```

- [ ] **Step 2: Boot the dev stack**

```bash
npm run dev:all
```

This boots sync (`:4200`), api, and Vite (`:5173`) in parallel.

- [ ] **Step 3: Open the app + sign in as an empty account**

Open `http://localhost:5173/` in a browser. Sign in (or onboard a new
account if none exists). With no conversations and no contacts, verify:

1. `/` shows the reading-pane EmptyPane: oversized Lattice watermark in the
   bottom-right corner (very faint), three cosmic dots scattered across the
   pane, a centered 58px Lattice above the title "select a conversation"
   and the description "or start a new one — end-to-end encrypted".
2. Sidebar header shows the small Lattice mark to the left of the avatar.
3. Switching the sidebar tab to "contacts" shows the compact EmptyPane
   with the "add a contact" CTA.
4. Visit `/contacts` directly — same compact EmptyPane treatment.
5. Visit `/connections/pending` — compact EmptyPane "no pending requests".
6. Visit `/connections/live-invites` — compact EmptyPane with "create
   invitation" CTA.
7. Toggle the theme to light via `/settings`. Each surface still reads
   correctly — Lattice contrast holds; watermark opacity stays subtle.

- [ ] **Step 4: Stop the dev stack**

`Ctrl+C` to kill `dev:all`. Exit the nix shell with `exit`.

No commit — manual verification.

### Task 3.3: Re-capture the affected audit rows

Per the per-sub-unit verification protocol in
`docs/superpowers/specs/2026-06-13-unit-8-final-alignment-design.md:178`,
each sub-unit re-captures its affected routes before marking ready-to-merge.
This task is optional within the implementation plan — the brief notes "spot
check via `npm run dev:all`" but does not require a full audit re-capture as
a gate. Skip this task if running the capture is too heavy for the local
dev box; the post-implementation Phase C audit will re-capture everything.

- [ ] **Step 1: (optional) Run the audit capture script**

```bash
nix-shell --run "npm run audit:capture"
```

This produces fresh screenshots in `docs/superpowers/audit/unit-8/live/`.

- [ ] **Step 2: (optional) Eyeball the new captures**

Open:
- `docs/superpowers/audit/unit-8/live/conv-list-empty--desktop.png`
- `docs/superpowers/audit/unit-8/live/conv-list-empty--mobile.png`
- `docs/superpowers/audit/unit-8/live/contacts-empty--desktop.png`
- `docs/superpowers/audit/unit-8/live/contacts-empty--mobile.png`
- `docs/superpowers/audit/unit-8/live/connections-pending-empty--desktop.png`
- `docs/superpowers/audit/unit-8/live/connections-pending-empty--mobile.png`
- `docs/superpowers/audit/unit-8/live/connections-live-invites-empty--desktop.png`
- `docs/superpowers/audit/unit-8/live/connections-live-invites-empty--mobile.png`

Confirm each shows the EmptyPane treatment (watermark on the desktop
reading-pane row; compact Lattice + hint on the others).

- [ ] **Step 3: (optional) Commit the updated captures**

```bash
git add docs/superpowers/audit/unit-8/live/
git commit -m "audit(unit-8b): re-capture empty-state surfaces after EmptyPane wiring"
```

### Task 3.4: Conditional adoption of `bg-gradient-cosmic` (if Prep · Tokens has merged)

**Files:**
- Modify: `src/components/empty-pane.tsx` (only if the utility exists)

The brief notes that the reading-pane variant may use `bg-gradient-cosmic`
as the watermark backdrop fill instead of plain `bg-bg`, if the Prep ·
Tokens sub-unit has merged that token utility. This task is conditional.

- [ ] **Step 1: Check whether the utility exists**

```bash
grep -n "bg-gradient-cosmic\|gradient-cosmic" tailwind.config.ts src/styles/tokens.css 2>/dev/null
```

- If grep returns matches in **both** files (token declared in tokens.css
  + Tailwind utility wired in tailwind.config.ts), proceed to Step 2.
- If grep returns no matches, **skip this task entirely** — the reading-pane
  variant ships with `bg-bg` and `Lattice` + dot sprinkles, which the audit
  notes is an acceptable replication of the cosmic backdrop (see
  `docs/superpowers/specs/2026-06-13-unit-8-audit.md:104`).

- [ ] **Step 2: Update the reading-pane backdrop class (only if utility exists)**

In `src/components/empty-pane.tsx`, change the `ReadingPaneVariant`
outer `<div>` className from:

```tsx
className="relative flex h-full w-full flex-col items-center justify-center gap-[18px] overflow-hidden bg-bg"
```

to:

```tsx
className="relative flex h-full w-full flex-col items-center justify-center gap-[18px] overflow-hidden bg-bg bg-gradient-cosmic"
```

The order matters in Tailwind: `bg-gradient-cosmic` (a `background-image`)
layers on top of `bg-bg` (a `background-color`), giving the cosmic radial
glow over the void background. If `bg-gradient-cosmic` is defined as
`background-image: var(--gradient-cosmic)` only, the color underneath
shows through transparent stops. Verify by inspecting the rendered
element in the browser devtools.

- [ ] **Step 3: Run verifications**

```bash
npx vitest run tests/unit/components/empty-pane.test.tsx
npx tsc -b --noEmit
npm run check-tokens
```

Expected: PASS / 0 / 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/empty-pane.tsx
git commit -m "feat(empty-pane): layer bg-gradient-cosmic over bg-bg on reading-pane variant"
```

---

## Phase 4 · Cleanup

### Task 4.1: Remove the now-orphan `EmptyState` component

After Task 2.1, the only caller of `EmptyState` (`src/routes/conversations/index.tsx`) is on `EmptyPane`. Verify there are no remaining call-sites and delete the dead file + its test.

- [ ] **Step 1: Verify no remaining call-sites**

```bash
grep -rn "EmptyState\|from \"@/components/empty-state\"" src/ tests/ 2>/dev/null
```

Expected: **only** matches in `src/components/empty-state.tsx` itself and
in `tests/unit/components/empty-state.test.tsx`. If any other file matches
(e.g. a route under `routes/` or another component), stop and migrate that
call-site to `EmptyPane` first — pick the appropriate variant per the
"reading-pane vs compact" guidance in `src/components/empty-pane.tsx`'s
header comment.

- [ ] **Step 2: Delete the orphan files**

```bash
git rm src/components/empty-state.tsx tests/unit/components/empty-state.test.tsx
```

- [ ] **Step 3: Run the full verification matrix**

```bash
npx vitest run
npx tsc -b --noEmit
npm run check-tokens
```

Expected: all PASS / 0 / 0.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(empty-state): remove orphan EmptyState component superseded by EmptyPane"
```

---

## Self-review checklist

Before marking the plan ready-to-merge, walk this checklist:

- [ ] **Audit-row coverage.** Confirm each of the 8 specified rows has a
  task that closes it:
  - AUDIT-007 (`/` desktop) → Task 2.1
  - AUDIT-008 (`/` mobile) → Task 2.1 (mobile inherits desktop deltas; the
    mobile screen on `/` shows the sidebar's chats tab full-width because
    `<main className="hidden md:flex">` hides the desktop pane — covered
    indirectly via Task 2.5's chats-tab empty wiring)
  - AUDIT-019 (`/contacts` desktop) → Task 2.2
  - AUDIT-020 (`/contacts` mobile) → Task 2.2 (mobile inherits)
  - AUDIT-029 (`/connections/pending` desktop) → Task 2.3
  - AUDIT-030 (`/connections/pending` mobile) → Task 2.3 (mobile inherits)
  - AUDIT-031 (`/connections/live-invites` desktop) → Task 2.4
  - AUDIT-032 (`/connections/live-invites` mobile) → Task 2.4 (mobile inherits)

- [ ] **Lattice placement.** Sidebar header gains a `<Lattice size={22}>`
  on initial paint via Task 3.1.

- [ ] **No new dependencies.** `package.json` is untouched.

- [ ] **No schema changes.** No file under `src/jazz/schema/` is modified.

- [ ] **Token guard.** Every new class string runs through
  `npm run check-tokens` at the end of each task. No raw `bg-white`,
  `text-gray-*`, `border-gray-*`, etc.

- [ ] **`text-muted-foreground` swaps.** Several touched files use
  `text-muted-foreground` (a shadcn-mapped class — still allowed by the
  check-tokens guard, but inconsistent with Arcan's token system). They're
  retained as-is in this plan because (a) the guard doesn't flag them and
  (b) replacing them is the broader job of 8e (Toast + skeleton call-sites,
  which sweeps inline status copy). If a future review wants them swapped
  to `text-dim` / `text-text-2`, that's a one-line follow-up.

- [ ] **Type consistency.** `EmptyPane`'s discriminated union (`variant:
  "reading-pane" | "compact"`) is preserved across every call-site. The
  CTA prop only exists on the compact variant — TypeScript catches misuse.

- [ ] **Commit cadence.** Each task ends with a single commit. Eight tasks
  → eight commits on `unit-8b-empty-pane`. (Tasks 0.1, 3.2, 3.3 are
  verification/manual — no commit.)

- [ ] **Followup tracking.** This plan does not capture any items via the
  `followup-tracking` skill because no out-of-scope drift was noticed
  while writing. If the executor notices anything (e.g. a stale comment,
  a hardcoded value, an adjacent bug), they should invoke
  `followup-tracking` at that moment per the global instructions.

---

## Out of scope (deferred to other sub-units / follow-ups)

- `AuthSurface` (auth/onboarding/recovery + pair scenes). Owned by 8a.
- Modal shell (change-password, view-recovery-code, etc.). Owned by 8c.
- Mobile chrome (safe-area, bottom-tab-bar tuning). Owned by 8d.
- Toast wiring on auth-flow CTAs + skeleton placeholders for loading
  states. Owned by 8e.
- Profile cosmic backdrop (`/profile/:meId`, `/profile/:bobId`). Owned by 8a.
- The `text-muted-foreground` → `text-dim` / `text-text-2` sweep across
  touched files. Owned by 8e.
- Removing the standalone `/contacts` route in favor of the sidebar
  contacts tab (one of the audit's headline observations — decision
  deferred to 8d).
