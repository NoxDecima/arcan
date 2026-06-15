# Unit 8d · Mobile chrome + sidebar separation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile chrome production-grade by wiring iOS safe-area insets into every fixed/sticky surface (mobile tab bar, composer, sidebar scroll padding), lock in the sidebar-separation treatment (Option A — hairline under tabs, already shipped, formalised here), deprecate the standalone `/contacts` route by redirecting it to `/?tab=contacts`, and verify the bottom tab bar stays hidden on chat-detail.

**Architecture:** Three small, near-independent edits and one redirect.

1. **Safe-area** is delivered as `viewport-fit=cover` in `index.html` plus inline `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}`-style declarations on the three fixed/sticky surfaces. No new tokens, no Tailwind plugin, no runtime hook — `env()` resolves to `0px` on browsers/viewports without a notch, so the styles are safe on desktop and on Android.
2. **Sidebar separation** is Option A (hairline under tabs) per the four variants in `design/hf-chat.jsx#SidebarOptions`. The current `Sidebar` already renders this treatment (`border-b border-hairline` under the tab row); this plan formalises the decision in a code comment + a Vitest smoke test so a future contributor can't drift into B/C/D without a deliberate revisit.
3. **Standalone /contacts** route is replaced with `<Navigate to="/?tab=contacts" replace />`. The root `ConversationsRoute` reads `?tab=` once on mount and seeds the `SidebarTab` context (`chats` default; `contacts` if `?tab=contacts`). The query param is then stripped so back-navigation behaves cleanly. `/contacts/add` and `/contacts/:contactID` keep their dedicated routes — only the list-page route is consolidated.
4. **Chat-detail chrome** already hides the `Sidebar` on `<md` (`hidden md:contents`) and `MobileTabBar` returns `null` for non-root paths. This plan adds a regression test so the hide doesn't silently break.

**Tech Stack:** React 18, react-router-dom 7 (`Navigate`, `useSearchParams`, `useNavigate`), Tailwind v3 utilities + inline `style` for `env()`, Vitest + React Testing Library.

**Spec context:**
- Unit 8 final-alignment design: `docs/superpowers/specs/2026-06-13-unit-8-final-alignment-design.md`
- Unit 8 Phase A audit: `docs/superpowers/specs/2026-06-13-unit-8-audit.md` — rows AUDIT-002, 004, 006, 008, 012, 014, 016, 018, 020, 022, 024, 026, 028, 030, 032, 034, 036, 038, 040, 042, 044, 046 and headline observations #4 (two contacts routes).
- Sidebar options reference: `design/hf-chat.jsx` lines 161–188 (`SidebarOptions` + `MiniNav`).
- Mobile tab/chat reference: `design/hf-list.jsx#MobTabBar`, `design/hf-chat.jsx` (HiPhone path lines 203–207).
- Phase A capture root: `docs/superpowers/audit/unit-8/live/` (mobile screenshots end in `--mobile.png`).

---

## Sidebar separation — pick + rationale

`design/hf-chat.jsx#SidebarOptions` enumerates four divider treatments between the "chats / contacts" tab row and the list body. The captions, verbatim from line 176:

| Key | Caption | Treatment |
|---|---|---|
| `line` | A · hairline under tabs | 1px `border-bottom` on the tab row container |
| `label` | B · section label | A `// recent` (or `recent`) all-caps mono label between tabs and list |
| `both` | C · label + hairline | Both A and B |
| `gap` | D · spacing only | No divider — only `18px 6px 8px` padding above the list |

**Pick: Option A — hairline under tabs.**

Rationale (in priority order):

1. **It's what already ships.** `src/components/sidebar.tsx:212` renders `<div className="flex border-b border-hairline" data-testid="sidebar-tabs">`. Picking A means zero visual churn while still formalising the decision in code/tests.
2. **B/C add a section label that only makes sense when the list has multiple groups.** The "recent" caption in the design implies a future "pinned / recent / archived" split. Live's sidebar today is a single flat list per tab (chats OR contacts); a `recent` label without a non-recent counterpart is decorative noise.
3. **D (spacing only) loses the visual hand-off between the tab control and the list.** With only two tabs and a tight color palette, an ungapped seam reads as a continuous panel — the active-tab underline becomes the only separator, which fights the existing 2px accent indicator under the active tab.
4. **A is the most legible at mobile widths.** On phone viewports the tab row is the entire top chrome of the contacts/chats screen; a hairline under it matches the design's `MobTabBar` (`hf-list.jsx:38–43`) which uses an identical `border-top: 1px solid c.border` between the body and the tab strip — A keeps the visual rhythm consistent top/bottom.

This pick is documented as a comment in `src/components/sidebar.tsx` and locked in by a Vitest test (`tests/unit/components/sidebar-separation.test.tsx`) that asserts the tab row container carries `border-b border-hairline`. Anyone who wants to change to B/C/D must consciously update both files.

---

## File Structure

Five existing files modified, two new files created. No schema files touched. No new dependencies.

- **Modify:** `index.html` — change `viewport` meta to include `viewport-fit=cover` so iOS exposes the safe-area-inset env values.
- **Modify:** `src/components/mobile-tab-bar.tsx` — inline `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}` + height fix so the tappable area stays 56px above the safe-area; add a docblock noting that the bar must remain hidden on non-root paths (regression-test anchor).
- **Modify:** `src/components/composer.tsx` — inline `style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}` on the textarea-row container so the input doesn't collide with the home indicator on chat-detail (where the composer is the bottommost element and the MobileTabBar is absent).
- **Modify:** `src/components/sidebar.tsx`
  - Inline `paddingBottom: 'calc(56px + env(safe-area-inset-bottom))'` on the scrollable nav body so the last conversation/contact row clears the fixed MobileTabBar + home indicator on mobile (and stays unaffected on desktop where the bar isn't present).
  - Add a comment block above the tab-row JSX that names the separation option (A) and links to this plan.
- **Modify:** `src/App.tsx`
  - Replace the `/contacts` route element with `<Navigate to="/?tab=contacts" replace />`.
- **Modify:** `src/routes/conversations/index.tsx` — on mount, read `?tab=contacts` from the URL and seed `useSidebarTab().setTab("contacts")`, then strip the query param so the URL stays clean and back-navigation works.
- **Create:** `tests/unit/components/sidebar-separation.test.tsx` — asserts the tab row container has `border-b border-hairline` (option A).
- **Create:** `tests/unit/components/mobile-tab-bar.test.tsx` — asserts (a) the bar renders on `/`, (b) returns `null` on `/conversations/:id`, (c) carries the safe-area inline style.

Diff target: ~150 lines added, ~10 lines deleted, ~80 lines of tests.

---

## Phase 0 · Setup

### Task 0.1: Verify branch + working tree

- [ ] **Step 1: Confirm branch**

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git rev-parse --abbrev-ref HEAD
```

Expected: `unit-8d-mobile-chrome` (created off `main`; if you're on a different branch, run `git checkout main && git checkout -b unit-8d-mobile-chrome`).

- [ ] **Step 2: Confirm clean tree (ignoring known untracked)**

```bash
git status --short
```

Expected: only `.claude/`, `ArcanUI.zip`, `playwright.visual.config.ts`, `tests/visual/` as untracked. No staged/modified files.

- [ ] **Step 3: Sanity-run the existing test + token guards**

```bash
npm run check-tokens
npx tsc -b --noEmit
npx vitest run --reporter=dot
```

Expected: `check-tokens` prints `✓ no ad-hoc Tailwind color/typography classes detected`; `tsc -b --noEmit` exits 0; vitest reports all passing. Capture the test count for comparison after Phase 4.

---

## Phase 1 · Viewport-fit + safe-area on fixed chrome

Order: viewport meta first (no behavior change until insets are consumed), then MobileTabBar (most visible delta), then Composer, then Sidebar scroll padding. Each step is a fresh failing-test → minimal-fix → commit cycle.

### Task 1.1: `viewport-fit=cover` in index.html

**Files:**
- Modify: `index.html:7`

- [ ] **Step 1: Edit the viewport meta**

In `index.html`, replace:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

with:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

`viewport-fit=cover` is the iOS-Safari opt-in that makes the page render under the notch / home-indicator and exposes the `env(safe-area-inset-*)` values to CSS. On non-iOS browsers it is a no-op. On desktop it is a no-op.

- [ ] **Step 2: Verify with grep**

```bash
grep -F 'viewport-fit=cover' index.html
```

Expected: one match printing the full updated meta line.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(unit-8d): viewport-fit=cover so safe-area insets resolve on iOS

Without viewport-fit=cover, env(safe-area-inset-*) resolves to 0px on
iOS Safari even on notched devices, so the upcoming mobile-chrome
padding has no effect. No behavior change on Android/desktop.

Refs: AUDIT-002/004/006/008/012/020/024/030/036/040/042 (mobile
safe-area family).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 1.2: MobileTabBar test — bar carries safe-area padding-bottom

**Files:**
- Create: `tests/unit/components/mobile-tab-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/mobile-tab-bar.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { SidebarTabProvider } from "@/components/sidebar-tab";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarTabProvider>
        <MobileTabBar />
      </SidebarTabProvider>
    </MemoryRouter>,
  );
}

describe("MobileTabBar", () => {
  it("renders on the root path", () => {
    const { queryByTestId } = renderAt("/");
    expect(queryByTestId("mobile-tab-bar")).not.toBeNull();
  });

  it("renders on /conversations", () => {
    const { queryByTestId } = renderAt("/conversations");
    expect(queryByTestId("mobile-tab-bar")).not.toBeNull();
  });

  it("returns null on chat-detail routes (full-screen view on mobile)", () => {
    const { queryByTestId } = renderAt("/conversations/abc123");
    expect(queryByTestId("mobile-tab-bar")).toBeNull();
  });

  it("returns null on /settings", () => {
    const { queryByTestId } = renderAt("/settings");
    expect(queryByTestId("mobile-tab-bar")).toBeNull();
  });

  it("carries safe-area-inset-bottom padding via inline style", () => {
    const { getByTestId } = renderAt("/");
    const bar = getByTestId("mobile-tab-bar");
    // jsdom doesn't compute env() but does preserve the inline string.
    expect(bar.style.paddingBottom).toBe("env(safe-area-inset-bottom)");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run tests/unit/components/mobile-tab-bar.test.tsx
```

Expected: 5 tests run, 4 pass (hide/show behavior is already correct), 1 fails — the `paddingBottom` assertion gets an empty string because the component doesn't yet declare the inline style.

- [ ] **Step 3: Add safe-area padding to the MobileTabBar**

In `src/components/mobile-tab-bar.tsx`, replace the `<nav …>` element with:

```tsx
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-hairline bg-rail"
      data-testid="mobile-tab-bar"
      style={{
        // Tappable area stays 56px; safe-area padding sits *below* the
        // tappable region so the bar floats above iOS's home indicator
        // without shrinking the hit targets.
        height: `calc(56px + env(safe-area-inset-bottom))`,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
```

(The previous `h-14` Tailwind class is replaced by the inline `height` so the safe-area math stays in one place.)

Also update the docblock at the top of the file:

```tsx
/**
 * MobileTabBar: fixed bottom tab bar visible only on the small-screen layout
 * AND only on the root screens (sidebar is the primary surface there).
 *
 * Hidden on non-root paths so deep routes (e.g. /conversations/:id) keep the
 * full vertical real estate — `/conversations/:id` is a full-screen view on
 * mobile per the Unit 8 design. Shares tab state with the desktop Sidebar
 * via the SidebarTab context.
 *
 * Safe-area: the bar sits above iOS's home indicator via
 * `env(safe-area-inset-bottom)`. The tappable region stays at 56px; the
 * inset is added *below* it. Requires `viewport-fit=cover` in index.html.
 */
```

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run tests/unit/components/mobile-tab-bar.test.tsx
```

Expected: 5 / 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/mobile-tab-bar.tsx tests/unit/components/mobile-tab-bar.test.tsx
git commit -m "$(cat <<'EOF'
feat(unit-8d): safe-area-inset-bottom on MobileTabBar

The fixed bottom tab bar now sits above iOS's home indicator. The
56px tappable region is preserved; the inset is added below it via
inline style so the math stays in one place. No effect on desktop
(env() resolves to 0px there) or on chat-detail (the bar is hidden).

Refs: AUDIT-008/020/030/032/034 (mobile bottom-chrome family).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 1.3: Composer safe-area padding

**Files:**
- Modify: `src/components/composer.tsx:168`

- [ ] **Step 1: Read the current composer footer**

The composer's send-row currently renders as `<div className="flex gap-2 p-3">…</div>`. On `/conversations/:id` (mobile) this row is the bottommost element on screen — there is no MobileTabBar to lift it. So the bottom padding needs to grow to clear the home indicator.

- [ ] **Step 2: Add the inline style**

In `src/components/composer.tsx`, change:

```tsx
      <div className="flex gap-2 p-3">
```

to:

```tsx
      <div
        className="flex gap-2 px-3 pt-3"
        style={{
          // 12px baseline + iOS safe-area on chat-detail (mobile full-screen).
          // Tailwind v3 doesn't ship a `pb-safe` util; inline keeps the
          // calc() expression colocated with the bottom-edge component.
          paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
        }}
      >
```

Rationale for the class split (`p-3` → `px-3 pt-3` + inline `paddingBottom`): mixing a Tailwind `pb-3` with an inline `paddingBottom` produces a specificity tussle that depends on stylesheet order. Splitting the axes avoids it.

- [ ] **Step 3: Type-check**

```bash
npx tsc -b --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Run any composer-touching tests**

```bash
npx vitest run tests/unit/
```

Expected: existing pass count unchanged. (There's no composer unit test today; the assertion is that nothing regresses.)

- [ ] **Step 5: Commit**

```bash
git add src/components/composer.tsx
git commit -m "$(cat <<'EOF'
feat(unit-8d): safe-area-inset-bottom on Composer

On mobile chat-detail the composer is the bottommost element (no
MobileTabBar to lift it), so the send-row needs its own safe-area
padding to clear the iOS home indicator. The 12px baseline padding
is preserved via calc().

Refs: AUDIT-012/014 (mobile chat-detail composer safe-area).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 1.4: Sidebar scroll-body bottom padding

**Files:**
- Modify: `src/components/sidebar.tsx` (both `nav` elements — chats list and contacts list)

The Sidebar is the entire mobile screen on root paths. The fixed MobileTabBar overlays the bottom 56px (+ safe-area). The scrollable nav body needs `paddingBottom` so the last row scrolls clear of the bar — otherwise the bottommost conversation/contact sits permanently behind it.

- [ ] **Step 1: Update the chats `<nav>`**

In `src/components/sidebar.tsx`, change:

```tsx
        <nav
          className="flex-1 overflow-y-auto p-2"
          data-testid="conversation-list"
        >
```

to:

```tsx
        <nav
          className="flex-1 overflow-y-auto p-2"
          data-testid="conversation-list"
          style={{
            // Mobile: clear the fixed MobileTabBar (56px) + iOS safe-area.
            // env() resolves to 0px on desktop; the tab bar is also hidden
            // there (md:hidden), so the extra 56px is harmless on >=md.
            paddingBottom: "calc(56px + env(safe-area-inset-bottom))",
          }}
        >
```

- [ ] **Step 2: Update the contacts `<nav>`**

Same change for the second `<nav>` (testid `sidebar-contacts-list`):

```tsx
        <nav
          className="flex-1 overflow-y-auto p-2"
          data-testid="sidebar-contacts-list"
          style={{
            paddingBottom: "calc(56px + env(safe-area-inset-bottom))",
          }}
        >
```

- [ ] **Step 3: Type-check + token guard**

```bash
npx tsc -b --noEmit
npm run check-tokens
```

Expected: both exit 0.

- [ ] **Step 4: Run unit tests**

```bash
npx vitest run tests/unit/
```

Expected: same pass count as before.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(unit-8d): Sidebar nav bottom padding clears MobileTabBar + safe-area

On mobile the Sidebar fills the screen and the MobileTabBar floats
fixed at the bottom. Without bottom padding the last conversation /
contact row sits permanently under the bar. The padding is harmless
on desktop (the bar is md:hidden there).

Refs: AUDIT-008/020/022/030/032 (mobile tab-bar overlap with list).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 · Sidebar separation — formalise option A

The current sidebar already renders Option A (hairline under tabs). This phase pins it down with a comment + a single-purpose Vitest test so a future contributor can't drift into B / C / D without a deliberate revisit.

### Task 2.1: Failing test asserting option A

**Files:**
- Create: `tests/unit/components/sidebar-separation.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/sidebar-separation.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarTabProvider } from "@/components/sidebar-tab";

// We import the Sidebar lazily inside the test so the file's top-level
// jazz-tools side effects don't trip vitest's environment setup. The
// SidebarSeparationMarker assertion below is structural: we look for the
// `[data-testid="sidebar-tabs"]` container and check its className for
// the chosen divider treatment (option A — `border-b border-hairline`).
//
// Mock useAccount so the component renders without a real Jazz context.
vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "Test", avatar: null },
    root: {
      contactBook: [],
      knownConversations: [],
      lastReadAt: {},
    },
    $jazz: { id: "co_test" },
  }),
}));

describe("Sidebar separation (Option A · hairline under tabs)", () => {
  it("the tab row container carries `border-b border-hairline`", async () => {
    const { Sidebar } = await import("@/components/sidebar");
    const { getByTestId } = render(
      <MemoryRouter>
        <SidebarTabProvider>
          <Sidebar />
        </SidebarTabProvider>
      </MemoryRouter>,
    );

    const tabRow = getByTestId("sidebar-tabs");
    const cls = tabRow.className;
    expect(cls).toMatch(/\bborder-b\b/);
    expect(cls).toMatch(/\bborder-hairline\b/);
  });

  it("does NOT carry a section-label header (rules out options B / C)", async () => {
    const { Sidebar } = await import("@/components/sidebar");
    const { queryByText } = render(
      <MemoryRouter>
        <SidebarTabProvider>
          <Sidebar />
        </SidebarTabProvider>
      </MemoryRouter>,
    );

    // Design's options B and C render a `recent` (or `// recent`) label
    // between the tab row and the list. Option A omits it.
    expect(queryByText(/^\s*(\/\/\s*)?recent\s*$/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run tests/unit/components/sidebar-separation.test.tsx
```

Expected: 2 / 2 passing on first run. (The current sidebar already implements option A; this test pins it down so the next subagent can't accidentally drift.)

If either assertion fails, do NOT relax the assertion — fix the sidebar so it satisfies option A.

### Task 2.2: Code comment locking in the pick

**Files:**
- Modify: `src/components/sidebar.tsx` (above the tab-header div near line 212)

- [ ] **Step 1: Add the comment**

In `src/components/sidebar.tsx`, find:

```tsx
      {/* Tab header (Unit 4 Phase 4) */}
      <div className="flex border-b border-hairline" data-testid="sidebar-tabs">
```

and replace with:

```tsx
      {/*
        Tab header (Unit 4 Phase 4) — sidebar separation pinned to
        Option A · hairline under tabs (Unit 8d).

        The four options enumerated in design/hf-chat.jsx#SidebarOptions:
          A · hairline under tabs   <-- chosen
          B · section label ("recent")
          C · label + hairline
          D · spacing only

        Rationale (see docs/superpowers/plans/2026-06-13-unit-8d-mobile-chrome.md):
        A matches the current shipping treatment, keeps visual rhythm
        consistent with the mobile bottom tab bar's top hairline, and
        avoids the orphaned `recent` label that would imply a multi-group
        list the live sidebar doesn't have.

        Anchored by tests/unit/components/sidebar-separation.test.tsx —
        changes to this divider treatment must update that test in lockstep.
      */}
      <div className="flex border-b border-hairline" data-testid="sidebar-tabs">
```

- [ ] **Step 2: Re-run the separation test + token guard**

```bash
npx vitest run tests/unit/components/sidebar-separation.test.tsx
npm run check-tokens
```

Expected: 2 / 2 passing, `✓ no ad-hoc Tailwind color/typography classes detected`.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar.tsx tests/unit/components/sidebar-separation.test.tsx
git commit -m "$(cat <<'EOF'
feat(unit-8d): pin sidebar separation to Option A (hairline under tabs)

design/hf-chat.jsx#SidebarOptions presents four divider treatments
between the chats/contacts tabs and the list body. Unit 4 shipped
Option A by default; Unit 8d formalises the pick with a comment
naming the chosen option and a Vitest test asserting `border-b
border-hairline` on the tab-row container + the absence of a
section-label header.

Rationale lives in the Unit 8d plan; the short version: A matches
the existing live treatment, mirrors the MobileTabBar's top hairline,
and avoids the orphaned "recent" label B/C would introduce.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 · Standalone /contacts → redirect to /?tab=contacts

The standalone `ContactsRoute` (page-shaped with a back-link + title) survives alongside the `contacts` tab inside the sidebar. They visually diverge (Phase A audit headline #4). The decision: deprecate the standalone route, redirect, and seed the sidebar tab from `?tab=contacts`.

### Task 3.1: Make ConversationsRoute read `?tab=contacts`

**Files:**
- Modify: `src/routes/conversations/index.tsx`

- [ ] **Step 1: Add the query-param effect**

In `src/routes/conversations/index.tsx`, replace the full file with:

```tsx
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Sidebar } from "@/components/sidebar";
import { EmptyState } from "@/components/empty-state";
import { useSidebarTab } from "@/components/sidebar-tab";

/**
 * The "select a conversation" view shown at /conversations when no specific
 * conversation is selected. Renders the sidebar + an empty main area.
 *
 * Unit 8d: also handles the `?tab=contacts` query param that the deprecated
 * standalone /contacts route redirects to. We seed the SidebarTab context
 * on mount and then strip the query param so the URL stays clean and the
 * back-button doesn't loop the user into a redirect cycle.
 */
export function ConversationsRoute() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setTab } = useSidebarTab();

  useEffect(() => {
    const requested = searchParams.get("tab");
    if (requested === "contacts" || requested === "chats") {
      setTab(requested);
      // Strip ?tab=… from the URL — `replace` so back-nav skips this entry.
      navigate("/", { replace: true });
    }
    // We intentionally only react to the first mount: subsequent in-app tab
    // switches go through setTab directly, not through the query param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

- [ ] **Step 2: Type-check**

```bash
npx tsc -b --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/routes/conversations/index.tsx
git commit -m "$(cat <<'EOF'
feat(unit-8d): ConversationsRoute reads ?tab=contacts query param

Seed the SidebarTab context from ?tab=… on first mount, then strip
the param via `navigate('/', { replace: true })`. Prepares the redirect
of the deprecated standalone /contacts route in the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 3.2: Redirect /contacts → /?tab=contacts

**Files:**
- Modify: `src/App.tsx` (around line 144)

- [ ] **Step 1: Edit the route**

In `src/App.tsx`, find:

```tsx
        <Route path="/contacts" element={<ContactsRoute />} />
        <Route path="/contacts/add" element={<ContactAddRoute />} />
        <Route path="/contacts/:contactID" element={<ContactDetailRoute />} />
```

and replace with:

```tsx
        {/*
          Unit 8d: deprecate the standalone /contacts list page in favor of
          the sidebar `contacts` tab. The list visually diverged from the
          tab (back-link + page title) and there was no spec justification
          for two separate surfaces. /contacts/add and /contacts/:contactID
          keep their dedicated routes — only the list page redirects.
        */}
        <Route path="/contacts" element={<Navigate to="/?tab=contacts" replace />} />
        <Route path="/contacts/add" element={<ContactAddRoute />} />
        <Route path="/contacts/:contactID" element={<ContactDetailRoute />} />
```

(`Navigate` is already imported from `react-router-dom` at the top of the file — no new import.)

- [ ] **Step 2: Remove the now-unused ContactsRoute import**

Still in `src/App.tsx`, find:

```tsx
import { ContactsRoute } from "./routes/contacts";
```

and delete that single line.

- [ ] **Step 3: Type-check**

```bash
npx tsc -b --noEmit
```

Expected: exit 0. If you see "ContactsRoute is declared but never used", you missed Step 2.

- [ ] **Step 4: Verify the route file is still safe to keep on disk**

Leave `src/routes/contacts/index.tsx` on disk for now — it's no longer mounted, but a follow-up cleanup commit at the end of this plan deletes it. (Keeping it across the redirect commit makes the diff easier to review and the revert easier to perform if QA flags something.)

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "$(cat <<'EOF'
feat(unit-8d): redirect /contacts to /?tab=contacts

The standalone /contacts list page diverged visually from the sidebar
`contacts` tab (back-link + page title vs. neither) without spec
justification. Redirect the list route into the sidebar tab. The
detail (/contacts/:contactID) and add (/contacts/add) routes keep
their dedicated entry points.

Refs: Phase A audit headline #4 (two contacts routes).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 3.3: Delete the orphaned ContactsRoute file

**Files:**
- Delete: `src/routes/contacts/index.tsx`

- [ ] **Step 1: Verify no other references**

```bash
grep -rn "from.*routes/contacts['\"]\|from.*routes/contacts/index\|ContactsRoute" src tests 2>/dev/null
```

Expected: no matches. (If anything shows up, fix that callsite before deleting.)

- [ ] **Step 2: Delete the file**

```bash
git rm src/routes/contacts/index.tsx
```

- [ ] **Step 3: Type-check + token guard + tests**

```bash
npx tsc -b --noEmit
npm run check-tokens
npx vitest run --reporter=dot
```

Expected: all three exit 0; vitest pass count = (pre-Phase-0 count) + 7 (5 from MobileTabBar + 2 from sidebar-separation).

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(unit-8d): delete orphaned ContactsRoute file

The /contacts route now redirects to /?tab=contacts and the
ContactsRoute component is no longer mounted anywhere. Drop the
file. /contacts/add (AddContactRoute) and /contacts/:contactID
(ContactDetailRoute) live in sibling files and are unaffected.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 · Chat-detail full-screen on mobile — regression test

`MobileTabBar` already returns `null` for non-root paths (covered by the Task 1.2 tests). The `Sidebar` is already hidden on `<md` for the chat-detail route (`hidden md:contents`). This phase adds one more focused test to lock in the full-screen-on-mobile invariant for chat-detail specifically, and verifies the documentation says so.

### Task 4.1: Verify the Sidebar hide on chat-detail

**Files:**
- Read-only: `src/routes/conversations/detail.tsx`

- [ ] **Step 1: Confirm the existing structure**

```bash
grep -n 'hidden md:contents' src/routes/conversations/detail.tsx
```

Expected: 4 hits (loading, conversation-not-found, still-loading, main render) — one `<div className="hidden md:contents"><Sidebar /></div>` in each render branch.

If any branch is missing the wrapper, add it. The pattern is:

```tsx
      <div className="hidden md:contents"><Sidebar /></div>
```

(`md:contents` makes the wrapping `<div>` collapse into the flex parent on `>=md` so the Sidebar's own `<aside>` flex sizing still works.)

- [ ] **Step 2: Confirm the MobileTabBar `ROOT_PATHS` excludes `/conversations/:id`**

```bash
grep -n 'ROOT_PATHS' src/components/mobile-tab-bar.tsx
```

Expected: `const ROOT_PATHS = ["/", "/conversations"];` — the `:id` variants are excluded by virtue of not matching, and the Task 1.2 unit test pins this.

- [ ] **Step 3: No code change required**

If both Step 1 and Step 2 pass cleanly, skip to Task 4.2. If either fails, fix the offending file and add a new Vitest test that pins the invariant before continuing.

### Task 4.2: Final verification + push

- [ ] **Step 1: Token guard**

```bash
npm run check-tokens
```

Expected: `✓ no ad-hoc Tailwind color/typography classes detected`.

- [ ] **Step 2: Type-check**

```bash
npx tsc -b --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Unit tests**

```bash
npx vitest run
```

Expected: pre-Phase-0 pass count + 7 new tests, all green.

- [ ] **Step 4: Manual spot-check via dev server**

Inside `nix-shell`:

```bash
npm run dev:all
```

Then in a Chromium browser:

1. Resize to ~390x844 (iPhone 14 portrait) using DevTools device mode.
2. Sign in to a seeded account (any from `scripts/audit/fixtures.ts`).
3. Confirm `/` shows the MobileTabBar at the bottom with a visible safe-area gap when the simulator includes a home indicator.
4. Tap a conversation; confirm the MobileTabBar disappears entirely and the Composer's send-row clears the home indicator.
5. Tap the contacts tab; confirm the list scrolls and its last row clears the tab bar.
6. Navigate to `/contacts` directly in the URL bar; confirm it redirects to `/` and the contacts tab is active.
7. Navigate to `/contacts/add` and `/contacts/<id>`; confirm both still render their dedicated pages.
8. Resize back to desktop; confirm no `pb-` calc residue visible (the extra padding sits below the viewport on `>=md` because the MobileTabBar is gone).

If any step fails, file a follow-up via the `followup-tracking` skill before proceeding.

- [ ] **Step 5: Self-review (see checklist below)**

Walk the self-review checklist at the bottom of this plan before pushing.

- [ ] **Step 6: Final commit (only if you added incidental polish)**

If Steps 1–5 surfaced no fix-up commits, skip this step — the branch is already in a shippable state. Otherwise:

```bash
git add -p
git commit -m "$(cat <<'EOF'
fix(unit-8d): <one-line summary of the fix-up>

<2-3 sentences describing what spot-check surfaced and how it was
addressed.>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review checklist

Walk this before marking the plan complete.

**1. Spec coverage.**

- [ ] AUDIT-002, 004, 006, 008, 012, 014, 016, 018, 020, 022, 024, 026, 028, 030, 032, 034, 036, 038, 040, 042, 044, 046 — mobile safe-area + bottom-tab-bar overlap covered by Tasks 1.1–1.4.
- [ ] Headline observation #4 (two contacts routes) — covered by Tasks 3.1–3.3.
- [ ] Sidebar separation pick — covered by Phase 2 (rationale documented in this plan, comment in code, test in vitest).
- [ ] Chat-detail full-screen on mobile — covered by Task 1.2 (MobileTabBar test) + Phase 4 (Sidebar hide verification).

**2. Placeholder scan.**

- [ ] No `TBD`, `TODO`, `implement later`, or "similar to Task N" references in this plan.
- [ ] Every step that changes code shows the full code, not a description.
- [ ] All command outputs are described as concrete `Expected: …` values.

**3. Type consistency.**

- [ ] `paddingBottom: "env(safe-area-inset-bottom)"` vs `paddingBottom: "calc(12px + env(safe-area-inset-bottom))"` vs `paddingBottom: "calc(56px + env(safe-area-inset-bottom))"` — three distinct values for three distinct surfaces; cross-checked across Tasks 1.2, 1.3, 1.4.
- [ ] `data-testid="mobile-tab-bar"` and `data-testid="sidebar-tabs"` referenced in tests match the live component testids.
- [ ] `useSidebarTab` / `SidebarTabProvider` / `SidebarTab` types match the existing `src/components/sidebar-tab.tsx` exports.
- [ ] `Navigate to="/?tab=contacts"` — the query param key `tab` is read in Task 3.1 and written in Task 3.2; spelled identically.

**4. Constraint compliance.**

- [ ] No schema files (`src/jazz/schema/*`) touched.
- [ ] No new dependencies added (verify via `git diff main -- package.json`).
- [ ] `npm run check-tokens` clean — no ad-hoc Tailwind color/typography classes introduced.
- [ ] No emoji added to source files (only in design references, untouched).

**5. Commit hygiene.**

- [ ] 7 commits total (Tasks 1.1 / 1.2 / 1.3 / 1.4 / 2.2 / 3.1 / 3.2 / 3.3 = 8 if you count Task 3.3's cleanup, plus optional Task 4.2.6).
- [ ] Each commit body opens with `feat(unit-8d): …`, `chore(unit-8d): …`, or `fix(unit-8d): …`.
- [ ] All commits end with the `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer.

**6. Followups.**

- [ ] Any deferrable items surfaced during execution (e.g. "Tailwind plugin for `pb-safe` would dedupe the calc()s" or "the Composer's bare `bg-background` colour token isn't from the Arcan token set, fix as part of 8c") are captured via the `followup-tracking` skill before commit, not lost to the diff.

---

Plan complete. After execution, the branch should be ready for a `--no-ff` merge to `main` and capture re-run as part of Phase C.
