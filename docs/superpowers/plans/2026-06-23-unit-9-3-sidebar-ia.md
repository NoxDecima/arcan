# Unit 9-3 — Sidebar & Navigation IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the sidebar / navigation information architecture so the add-action becomes a floating FAB, tabs get leading icons, the header drops the Arcan mark and gains a settings gear, the footer settings link is removed, mobile tabs render bottom-only, and chat rows show last-message preview + timestamp + unread pill badge — matching `design/proto.jsx`.

**Architecture:** The authenticated shell already exists (`src/components/app-shell.tsx`: desktop sidebar `hidden md:flex`; `ConversationsRoute` mounts a `md:hidden` mobile `<Sidebar />`). We add two tiny reusable components — an inline-SVG `Icon` (4 glyphs: chat / people / gear / plus) and a `Fab` — then surgically edit `src/components/sidebar.tsx` and `src/components/mobile-tab-bar.tsx`. Chat-row preview text comes from a new pure helper in `src/jazz/notifications.ts`. No router or schema changes.

**Tech Stack:** TypeScript (strict), React 18, Tailwind v3 (token utilities only — enforced by `npm run check-tokens`), jazz-tools 0.20.18 (Zod-based API; schema introspection via `.shape`), Vitest for unit tests, all run inside `nix-shell`.

**Spec:** `docs/superpowers/specs/2026-06-23-unit-9-feedback-log.md` §2 items 2-A/2-B/2-C/2-D/2-E and §3.1 items 3.1-A..D. Canonical design reference: `design/proto.jsx` (`ChatsScreen` ~line 86, `ContactsScreen` ~line 116, `Fab` ~line 145, the desktop `DesktopApp` left column ~line 760-780 with `tabBtn`/`convoRow`) and `design/hf-list.jsx` (`MobTab`, `MobTabBar`, `MobChatsList`, FAB block ~line 57). Follow the prototype where it differs from hi-fi.

---

## Design values cited from the reference files

These exact values come from the design files — use them verbatim.

- **FAB size:** desktop `50×50`px (`proto.jsx:777` `DesktopApp` FAB `width: 50, height: 50`); mobile `52×52`px (`proto.jsx:148` `Fab`); hi-fi `MobChatsList` uses `50×50` (`hf-list.jsx:57`). We standardize on **`52px`** (the shared `Fab` component value) for both, since one component serves both layouts.
- **FAB radius:** pill — `borderRadius: 999` when `s.soft` (the v5 soft skin is canonical per DEC-1). Use `rounded-pill`.
- **FAB fill / icon color:** `background: c.accentFill` → `bg-arcan-accent`; icon `c.onAccent` → `text-on-accent`.
- **FAB drop shadow:** `boxShadow: 0 8px 22px alpha(accentFill, .45)` (`proto.jsx:148`). We map this to the existing `shadow-level-2` token (a soft elevated shadow already defined in `tokens.css`) so we stay token-compliant — `check-tokens.sh` does not police `boxShadow` but we avoid raw rgba literals anyway.
- **FAB position:** `position: absolute; right: 16; bottom: 16` (`proto.jsx:148`). On mobile it must float **above** the 56px bottom tab bar — so mobile bottom offset = `calc(16px + 56px + env(safe-area-inset-bottom))`.
- **Plus icon size:** `24` with `sw` (stroke-width) `2.2` (`proto.jsx:149`). Render at `22px` (hi-fi `MobChatsList` uses 22).
- **Tab icon size:** `15` desktop (`proto.jsx:735` `tabBtn`), `20` mobile (`hf-list.jsx:31` `MobTab`). The sidebar tab row is the desktop treatment → render at **`16px`** (a clean value in the 15-20 design band). Mobile bottom tabs render at **`20px`**.
- **Header gear icon size:** `19` desktop (`proto.jsx:769`), `20` mobile (`hf-list.jsx:53`). Use **`20px`**.
- **Chat-row timestamp:** `font: 500 9.5px dim` top-right (`proto.jsx:100`) → `text-xs text-dim`.
- **Chat-row preview:** `text2` if unread, `dim` if read, truncated (`proto.jsx:103`) → `text-text-2` (unread) / `text-dim` (read), `truncate`.
- **Unread badge:** `minWidth: 17, height: 17, padding: 0 5px, borderRadius: 999, background: accentFill, color: onAccent, font: 700 9.5px` (`proto.jsx:104`) → `rounded-pill bg-arcan-accent text-on-accent`, `min-w-[17px] h-[17px]`, `text-xs font-bold`.
- **Bold-when-unread:** name `font-weight 700`, preview `font-weight 500` when unread (`proto.jsx:99,103`) → add `font-semibold` to name + preview when `unread > 0`.

---

## File structure

| File | Create / Modify | Responsibility |
|---|---|---|
| `src/components/icon.tsx` | **Create** | Tiny inline-SVG `<Icon name=… size=… />` rendering the 4 glyphs the IA needs (`chat`, `people`, `gear`, `plus`) with `currentColor` stroke so color is inherited from a token text-color class. |
| `src/components/fab.tsx` | **Create** | Floating action button. Pill, `bg-arcan-accent text-on-accent`, `shadow-level-2`, absolute bottom-right; mobile offset clears the 56px tab bar + safe area. |
| `src/jazz/notifications.ts` | **Modify** (add export `getLastMessagePreview`) | Pure helper deriving the truncated preview string for a conversation's last message (handles deleted / attachment-only / empty). |
| `src/components/sidebar.tsx` | **Modify** | Header: drop Lattice mark, drop `+` button, add gear→`/settings` link. Tabs: add leading icons. Rows: add timestamp + preview + unread pill + bold-when-unread. Footer: delete the settings link block. Mount `<Fab>`. |
| `src/components/mobile-tab-bar.tsx` | **Modify** | Add leading icons to the two bottom tabs (`chat` / `people`). (Bottom-only is already true — sidebar's own top tab row is `hidden md:flex` via AppShell; verify via test.) |
| `tests/unit/components/icon.test.tsx` | **Create** | Asserts Icon renders an `<svg>` with the expected `data-icon` and size. |
| `tests/unit/components/fab.test.tsx` | **Create** | Asserts Fab renders an accent-filled pill button with the plus icon and the mobile-clearance inline style. |
| `tests/unit/jazz/last-message-preview.test.ts` | **Create** | Unit tests for `getLastMessagePreview` (text, deleted, attachment-only, empty list). |
| `tests/unit/components/sidebar-ia.test.tsx` | **Create** | Header has no Lattice + no `+` button + has gear settings link; tabs have icons; footer settings link gone; FAB present; a seeded unread conversation row shows preview + timestamp + badge + bold name. |
| `tests/unit/components/mobile-tab-bar.test.tsx` | **Modify** | Add an assertion that each bottom tab renders its leading icon. |

---

## Task 1: Create the `Icon` component

The codebase has **no** icon library (no `lucide-react` in `package.json`) and no shared `Icon` component — SVGs are rendered inline (see `src/components/lattice.tsx`). The prototype uses `<Icon d="chat|people|gear|plus" …>`. We create a minimal typed equivalent. Stroke uses `currentColor` so callers set color via a token text-class (`text-dim`, `text-text-2`, `text-on-accent`).

**Files:**
- Create: `src/components/icon.tsx`
- Test: `tests/unit/components/icon.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/icon.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { Icon } from "@/components/icon";

describe("Icon", () => {
  it("renders an svg with the requested data-icon and size", () => {
    const { container } = render(<Icon name="gear" size={20} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("data-icon")).toBe("gear");
    expect(svg!.getAttribute("width")).toBe("20");
    expect(svg!.getAttribute("height")).toBe("20");
  });

  it("uses currentColor for the stroke so color is inherited", () => {
    const { container } = render(<Icon name="plus" />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("stroke")).toBe("currentColor");
  });

  it("supports all four IA glyphs", () => {
    for (const name of ["chat", "people", "gear", "plus"] as const) {
      const { container } = render(<Icon name={name} />);
      expect(container.querySelector(`svg[data-icon="${name}"]`)).not.toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/components/icon.test.tsx'`
Expected: FAIL — `Failed to resolve import "@/components/icon"` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/components/icon.tsx`:

```tsx
/**
 * Minimal inline-SVG icon set for the navigation IA (Unit 9-3).
 *
 * The codebase has no icon library; SVGs are authored inline (cf. Lattice).
 * The prototype (design/proto.jsx) references icons by a short key —
 * `Icon d="chat|people|gear|plus"`. This is the typed React equivalent for
 * the four glyphs the sidebar / tab-bar / FAB need.
 *
 * Color: stroke is `currentColor`, so callers set color with a token
 * text-class (e.g. `text-dim`, `text-on-accent`). Never hard-code a color.
 */
export type IconName = "chat" | "people" | "gear" | "plus";

interface IconProps {
  name: IconName;
  /** Pixel size (square). Default 20. */
  size?: number;
  /** Stroke width. Default 1.8. */
  strokeWidth?: number;
  className?: string;
  "data-testid"?: string;
}

// 24x24 viewBox paths. `chat` = speech bubble, `people` = two figures,
// `gear` = settings cog, `plus` = add.
const PATHS: Record<IconName, JSX.Element> = {
  chat: (
    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9.5 9.5 0 0 1-3.9-.8L3 21l1.9-4.1A8.38 8.38 0 0 1 4 12.5 8.5 8.5 0 0 1 12.5 4 8.38 8.38 0 0 1 21 11.5Z" />
  ),
  people: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className,
  "data-testid": testId,
}: IconProps) {
  return (
    <svg
      data-icon={name}
      data-testid={testId}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/components/icon.test.tsx'`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/icon.tsx tests/unit/components/icon.test.tsx
git commit -m "feat(unit-9-3): add inline-SVG Icon component (chat/people/gear/plus)"
```

---

## Task 2: Create the `Fab` floating action button

The prototype's `Fab` (`proto.jsx:145`) is an accent-filled pill, drop-shadowed, absolutely positioned bottom-right. On mobile it must clear the 56px bottom tab bar. We make one component that takes an `onClick`, a `label` (aria), and renders the plus icon.

**Files:**
- Create: `src/components/fab.tsx`
- Test: `tests/unit/components/fab.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/fab.test.tsx`:

```tsx
import { render, fireEvent } from "@testing-library/react";
import { Fab } from "@/components/fab";

describe("Fab", () => {
  it("renders an accent-filled pill button with the plus icon", () => {
    const { getByTestId } = render(<Fab label="New chat" onClick={() => {}} />);
    const btn = getByTestId("fab");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.className).toMatch(/\bbg-arcan-accent\b/);
    expect(btn.className).toMatch(/\btext-on-accent\b/);
    expect(btn.className).toMatch(/\brounded-pill\b/);
    expect(btn.querySelector('svg[data-icon="plus"]')).not.toBeNull();
    expect(btn.getAttribute("aria-label")).toBe("New chat");
  });

  it("fires onClick when pressed", () => {
    let clicked = false;
    const { getByTestId } = render(
      <Fab label="New chat" onClick={() => (clicked = true)} />,
    );
    fireEvent.click(getByTestId("fab"));
    expect(clicked).toBe(true);
  });

  it("floats above the bottom tab bar on mobile (inline bottom offset clears 56px)", () => {
    const { getByTestId } = render(<Fab label="New chat" onClick={() => {}} />);
    const styleAttr = getByTestId("fab").getAttribute("style") ?? "";
    expect(styleAttr).toMatch(
      /bottom:\s*calc\(16px \+ 56px \+ env\(safe-area-inset-bottom\)\)/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/components/fab.test.tsx'`
Expected: FAIL — `Failed to resolve import "@/components/fab"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/fab.tsx`:

```tsx
import { Icon } from "@/components/icon";

/**
 * Fab — bottom-right floating action button (Unit 9-3, item 2-C).
 *
 * Replaces the old "+" in the sidebar header. Pill, accent fill, drop
 * shadow, `position: absolute` within its scroll/list container. On mobile
 * it floats *above* the 56px bottom tab bar (`MobileTabBar`) plus the iOS
 * safe-area inset; on desktop the tab bar isn't present but the extra 56px
 * is harmless because the desktop list column is taller than its content.
 *
 * Design values: 52x52, pill, `bg-arcan-accent`, `text-on-accent`,
 * `shadow-level-2`, `right:16 bottom:16` (proto.jsx:145 + DesktopApp FAB).
 */
interface FabProps {
  /** Accessible label, e.g. "New chat" / "Add a contact". */
  label: string;
  onClick: () => void;
  "data-testid"?: string;
}

export function Fab({
  label,
  onClick,
  "data-testid": testId = "fab",
}: FabProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="absolute right-4 z-20 flex h-[52px] w-[52px] items-center justify-center rounded-pill bg-arcan-accent text-on-accent shadow-level-2"
      style={{
        // Float above the 56px MobileTabBar + iOS safe area on mobile.
        // env() resolves to 0px on desktop; the tab bar is also hidden there
        // so the extra 56px is harmless (the column is taller than content).
        // Wrapped in calc() so jsdom's CSSOM parses it during unit tests.
        bottom: "calc(16px + 56px + env(safe-area-inset-bottom))",
      }}
    >
      <Icon name="plus" size={22} strokeWidth={2.2} />
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/components/fab.test.tsx'`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/fab.tsx tests/unit/components/fab.test.tsx
git commit -m "feat(unit-9-3): add Fab floating action button (item 2-C)"
```

---

## Task 3: Add `getLastMessagePreview` helper

Chat rows need a last-message preview (item 3.1-B). There is no helper yet. Add a pure function next to `getUnreadCount` in `src/jazz/notifications.ts`. It returns the trimmed body of the most recent message, with sensible fallbacks for deleted / attachment-only / empty cases, matching how `message-bubble.tsx` treats those states.

**Files:**
- Modify: `src/jazz/notifications.ts` (append a new exported function)
- Test: `tests/unit/jazz/last-message-preview.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/jazz/last-message-preview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getLastMessagePreview } from "@/jazz/notifications";

// Minimal message stubs — the helper only reads body / deleted / attachments.
const msg = (over: Record<string, unknown>) => ({
  body: "",
  deleted: false,
  attachments: [],
  ...over,
});

describe("getLastMessagePreview", () => {
  it("returns the last message body", () => {
    const conv = { messages: [msg({ body: "hello" }), msg({ body: "latest" })] };
    expect(getLastMessagePreview(conv)).toBe("latest");
  });

  it("returns empty string when there are no messages", () => {
    expect(getLastMessagePreview({ messages: [] })).toBe("");
    expect(getLastMessagePreview({})).toBe("");
    expect(getLastMessagePreview(null)).toBe("");
  });

  it("shows a placeholder for a deleted last message", () => {
    const conv = { messages: [msg({ body: "", deleted: true })] };
    expect(getLastMessagePreview(conv)).toBe("message deleted");
  });

  it("shows a photo placeholder for an attachment-only last message", () => {
    const conv = { messages: [msg({ body: "", attachments: [{}] })] };
    expect(getLastMessagePreview(conv)).toBe("photo");
  });

  it("prefers the body over the attachment placeholder when both present", () => {
    const conv = { messages: [msg({ body: "caption", attachments: [{}] })] };
    expect(getLastMessagePreview(conv)).toBe("caption");
  });

  it("collapses internal whitespace / newlines to a single space", () => {
    const conv = { messages: [msg({ body: "line one\n\nline two" })] };
    expect(getLastMessagePreview(conv)).toBe("line one line two");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/jazz/last-message-preview.test.ts'`
Expected: FAIL — `getLastMessagePreview is not a function` (export does not exist).

- [ ] **Step 3: Write the implementation**

Append to `src/jazz/notifications.ts` (after the `markRead` function, at end of file):

```ts
/**
 * Derive a one-line preview for a conversation's most recent message
 * (Unit 9-3, item 3.1-B). Pure — reads only body / deleted / attachments.
 *
 * Fallbacks mirror how message-bubble.tsx renders these states:
 *  - deleted message       → "message deleted"
 *  - attachment-only (no body text) → "photo"
 *  - body present           → trimmed body, internal whitespace collapsed
 *  - no messages            → "" (caller decides what to show)
 *
 * Whitespace is collapsed so a multi-line message renders as a single
 * truncatable preview line.
 */
export function getLastMessagePreview(conversation: any): string {
  const messages = conversation?.messages;
  if (!messages || messages.length === 0) return "";
  const last = messages[messages.length - 1];
  if (!last) return "";
  if (last.deleted) return "message deleted";
  const body = typeof last.body === "string" ? last.body.trim() : "";
  if (body.length > 0) return body.replace(/\s+/g, " ");
  const attachments = last.attachments;
  if (attachments && attachments.length > 0) return "photo";
  return "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/jazz/last-message-preview.test.ts'`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/jazz/notifications.ts tests/unit/jazz/last-message-preview.test.ts
git commit -m "feat(unit-9-3): add getLastMessagePreview helper (item 3.1-B)"
```

---

## Task 4: Sidebar header — drop Lattice mark + `+`, add gear settings link

Item 2-B: header chrome = avatar + name + gear→settings only; remove the Lattice mark left of avatar+name. Item 2-C: remove the `+` button from the header (it becomes the FAB in Task 6). The gear is a `<Link to="/settings">` so it works without a navigate handler and is testable.

**Files:**
- Modify: `src/components/sidebar.tsx` (imports + the header `<div>` block, currently lines ~180-217)
- Test: `tests/unit/components/sidebar-ia.test.tsx` (created here; extended in later tasks)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/sidebar-ia.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarTabProvider } from "@/components/sidebar-tab";

// Mock useAccount so Sidebar renders without a real Jazz context.
vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "decima", avatar: null },
    root: {
      contactBook: [],
      knownConversations: [],
      lastReadAt: {},
    },
    $jazz: { id: "co_me" },
  }),
}));

async function renderSidebar() {
  const { Sidebar } = await import("@/components/sidebar");
  return render(
    <MemoryRouter>
      <SidebarTabProvider>
        <Sidebar />
      </SidebarTabProvider>
    </MemoryRouter>,
  );
}

describe("Sidebar IA — header chrome (items 2-B, 2-C)", () => {
  it("does NOT render the Lattice brand mark in the header", async () => {
    const { container } = await renderSidebar();
    // Lattice renders an <svg role="img" aria-label="Arcan">.
    expect(container.querySelector('svg[aria-label="Arcan"]')).toBeNull();
  });

  it("does NOT render a header '+' new-chat button", async () => {
    const { queryByTestId } = await renderSidebar();
    expect(queryByTestId("new-chat-btn")).toBeNull();
  });

  it("renders a gear settings link pointing to /settings", async () => {
    const { getByTestId } = await renderSidebar();
    const gear = getByTestId("sidebar-settings-gear");
    expect(gear.getAttribute("href")).toBe("/settings");
    expect(gear.querySelector('svg[data-icon="gear"]')).not.toBeNull();
  });

  it("still renders the avatar + display name", async () => {
    const { getByTestId } = await renderSidebar();
    expect(getByTestId("sidebar-avatar")).not.toBeNull();
    expect(getByTestId("sidebar-display-name").textContent).toBe("decima");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/components/sidebar-ia.test.tsx'`
Expected: FAIL — the Lattice `svg[aria-label="Arcan"]` is still present and `sidebar-settings-gear` is not found.

- [ ] **Step 3: Edit the imports**

In `src/components/sidebar.tsx`, the top imports currently include:

```tsx
import { EmptyPane } from "@/components/empty-pane";
import { Lattice } from "@/components/lattice";
```

Replace those two lines with:

```tsx
import { EmptyPane } from "@/components/empty-pane";
import { Icon } from "@/components/icon";
import { Fab } from "@/components/fab";
import { getLastMessagePreview } from "@/jazz/notifications";
```

(`Lattice` is removed; `Icon`, `Fab`, and `getLastMessagePreview` are added now so later tasks don't re-edit the import block. Note `getUnreadCount` is already imported on the existing `import { getUnreadCount } from "@/jazz/notifications";` line — leave that line as-is.)

- [ ] **Step 4: Replace the header block**

In `src/components/sidebar.tsx`, find the header block (the comment `{/* Header: Lattice brand mark + avatar/profile button + new chat button */}` through its closing `</div>`):

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
          <Avatar
            src={(me as any).profile.avatar}
            initials={me.profile.displayName?.[0] ?? "?"}
            size="sm"
            loadAs={me}
            data-testid="sidebar-avatar"
          />
          <span
            data-testid="sidebar-display-name"
            className="font-semibold text-text truncate"
          >
            {me.profile.displayName}
          </span>
        </button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/conversations/new")}
          data-testid="new-chat-btn"
          className="flex-shrink-0"
          title="New chat"
        >
          +
        </Button>
      </div>
```

Replace the entire block with (item 2-B: avatar + name + gear only; no Lattice, no `+`):

```tsx
      {/* Header (Unit 9-3, item 2-B): avatar + name + gear→settings only.
          The Arcan/Lattice mark was removed from list chrome — it lives in
          the empty-pane watermark + auth screens, not here. The old "+"
          moved to the bottom-right FAB (item 2-C). */}
      <div className="p-4 border-b border-hairline flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="sidebar-header-profile"
          data-account-id={myID}
          onClick={() => myID && navigate(`/profile/${myID}`)}
          className="flex items-center gap-2 min-w-0 text-left hover:opacity-90 flex-1"
          aria-label="Open your profile"
        >
          <Avatar
            src={(me as any).profile.avatar}
            initials={me.profile.displayName?.[0] ?? "?"}
            size="sm"
            loadAs={me}
            data-testid="sidebar-avatar"
          />
          <span
            data-testid="sidebar-display-name"
            className="font-semibold text-text truncate"
          >
            {me.profile.displayName}
          </span>
        </button>
        <Link
          to="/settings"
          data-testid="sidebar-settings-gear"
          className="flex-shrink-0 text-text-2 hover:text-text"
          aria-label="Settings"
          title="Settings"
        >
          <Icon name="gear" size={20} />
        </Link>
      </div>
```

(`Link` is already imported at the top of `sidebar.tsx`. The `Button` import may now be unused in the header but it is still used by the two `EmptyPane` CTAs further down, so leave the `Button` import in place.)

- [ ] **Step 5: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/components/sidebar-ia.test.tsx'`
Expected: PASS — 4 tests pass.

- [ ] **Step 6: Verify no token / type regressions and the separation test still passes**

Run: `nix-shell --run 'npm run check-tokens && npx vitest run tests/unit/components/sidebar-separation.test.tsx'`
Expected: `✓ no ad-hoc Tailwind color/typography classes detected` then 2 passing tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/sidebar.tsx tests/unit/components/sidebar-ia.test.tsx
git commit -m "feat(unit-9-3): sidebar header = avatar + name + gear; drop Lattice + '+' (items 2-B, 2-C)"
```

---

## Task 5: Sidebar tabs — add leading icons (item 2-A)

Item 2-A: chats/contacts tabs get leading icons (chat-bubble + people). The tab buttons currently render text only.

**Files:**
- Modify: `src/components/sidebar.tsx` (the `data-testid="sidebar-tabs"` block, currently lines ~238-263)
- Test: `tests/unit/components/sidebar-ia.test.tsx` (append a describe block)

- [ ] **Step 1: Add the failing test**

Append to `tests/unit/components/sidebar-ia.test.tsx` (inside the file, after the existing `describe`):

```tsx
describe("Sidebar IA — tab icons (item 2-A)", () => {
  it("the chats tab has a leading chat icon", async () => {
    const { getByTestId } = await renderSidebar();
    const chats = getByTestId("sidebar-tab-chats");
    expect(chats.querySelector('svg[data-icon="chat"]')).not.toBeNull();
    expect(chats.textContent).toContain("chats");
  });

  it("the contacts tab has a leading people icon", async () => {
    const { getByTestId } = await renderSidebar();
    const contacts = getByTestId("sidebar-tab-contacts");
    expect(contacts.querySelector('svg[data-icon="people"]')).not.toBeNull();
    expect(contacts.textContent).toContain("contacts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/components/sidebar-ia.test.tsx'`
Expected: FAIL — the new two tests fail: no `svg[data-icon="chat"]` / `svg[data-icon="people"]` inside the tab buttons. (The Task 4 tests still pass.)

- [ ] **Step 3: Edit the tab buttons**

In `src/components/sidebar.tsx`, find the two tab buttons inside `data-testid="sidebar-tabs"`. The chats button currently is:

```tsx
        <button
          type="button"
          data-testid="sidebar-tab-chats"
          className={`flex-1 py-2 text-xs font-semibold ${
            tab === "chats"
              ? "text-text border-b-2 border-arcan-accent"
              : "text-dim"
          }`}
          onClick={() => setTab("chats")}
        >
          chats
        </button>
```

Replace it with (add a flex wrapper for the leading icon):

```tsx
        <button
          type="button"
          data-testid="sidebar-tab-chats"
          className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 ${
            tab === "chats"
              ? "text-text border-b-2 border-arcan-accent"
              : "text-dim"
          }`}
          onClick={() => setTab("chats")}
        >
          <Icon name="chat" size={16} />
          chats
        </button>
```

Then the contacts button currently is:

```tsx
        <button
          type="button"
          data-testid="sidebar-tab-contacts"
          className={`flex-1 py-2 text-xs font-semibold ${
            tab === "contacts"
              ? "text-text border-b-2 border-arcan-accent"
              : "text-dim"
          }`}
          onClick={() => setTab("contacts")}
        >
          contacts
        </button>
```

Replace it with:

```tsx
        <button
          type="button"
          data-testid="sidebar-tab-contacts"
          className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 ${
            tab === "contacts"
              ? "text-text border-b-2 border-arcan-accent"
              : "text-dim"
          }`}
          onClick={() => setTab("contacts")}
        >
          <Icon name="people" size={16} />
          contacts
        </button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/components/sidebar-ia.test.tsx'`
Expected: PASS — all 6 tests pass (4 from Task 4 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx tests/unit/components/sidebar-ia.test.tsx
git commit -m "feat(unit-9-3): add leading icons to sidebar tabs (item 2-A)"
```

---

## Task 6: Sidebar — mount the FAB + remove the footer settings link (items 2-C, 2-D)

Item 2-C: the add-action is a bottom-right FAB. It must be context-aware: in the chats tab it goes to `/conversations/new`; in the contacts tab it goes to `/contacts/add` (matching `DesktopApp`: `dnav.push(tab === 'contacts' ? 'addcontact' : 'newconvo')`, `proto.jsx:777`). Item 2-D: delete the footer settings link block.

The FAB uses `position: absolute`, so its containing `<aside>` must be a positioning context. The outer `<aside>` already is `flex flex-col`; add `relative` to it.

**Files:**
- Modify: `src/components/sidebar.tsx` (the `<aside>` className, the footer block, and add `<Fab>` before `</aside>`)
- Test: `tests/unit/components/sidebar-ia.test.tsx` (append a describe block)

- [ ] **Step 1: Add the failing test**

Append to `tests/unit/components/sidebar-ia.test.tsx`:

```tsx
describe("Sidebar IA — FAB + footer (items 2-C, 2-D)", () => {
  it("renders the bottom-right FAB", async () => {
    const { getByTestId } = await renderSidebar();
    const fab = getByTestId("fab");
    expect(fab.querySelector('svg[data-icon="plus"]')).not.toBeNull();
  });

  it("does NOT render the footer settings link", async () => {
    const { queryByTestId } = await renderSidebar();
    expect(queryByTestId("settings-link")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/components/sidebar-ia.test.tsx'`
Expected: FAIL — `getByTestId("fab")` throws (no FAB yet) and `settings-link` is still present.

- [ ] **Step 3: Make the `<aside>` a positioning context**

In `src/components/sidebar.tsx`, find the main (non-loading) `<aside>` opening tag:

```tsx
    <aside className="w-full md:w-64 flex flex-col border-r border-hairline bg-panel">
```

Replace it with (add `relative` + `overflow-hidden` so the absolute FAB is clipped to the column):

```tsx
    <aside className="relative w-full md:w-64 flex flex-col border-r border-hairline bg-panel overflow-hidden">
```

- [ ] **Step 4: Remove the footer block and mount the FAB**

Find the footer block at the end of the component:

```tsx
      {/* Footer: settings link */}
      <div className="p-4 border-t border-hairline flex flex-col gap-2">
        <Link
          to="/settings"
          data-testid="settings-link"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ⚙ settings
        </Link>
      </div>
    </aside>
```

Replace the whole block with (footer deleted; FAB mounted; navigates per active tab — item 2-C/2-D):

```tsx
      {/* Unit 9-3 (item 2-C): bottom-right floating FAB replaces the old
          header "+". Context-aware target — new conversation in the chats
          tab, add-contact in the contacts tab (matches DesktopApp,
          design/proto.jsx:777). Item 2-D: the footer settings link was
          removed; settings is reached via the header gear. */}
      <Fab
        label={tab === "contacts" ? "Add a contact" : "New chat"}
        onClick={() =>
          navigate(tab === "contacts" ? "/contacts/add" : "/conversations/new")
        }
      />
    </aside>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/components/sidebar-ia.test.tsx'`
Expected: PASS — all 8 tests pass (6 prior + 2 new).

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar.tsx tests/unit/components/sidebar-ia.test.tsx
git commit -m "feat(unit-9-3): mount sidebar FAB + remove footer settings link (items 2-C, 2-D)"
```

---

## Task 7: Chat rows — preview + timestamp + unread badge + bold-when-unread (items 3.1-A..D)

Items 3.1-B/3.1-C/3.1-D: each chat row gets a two-line layout — name + timestamp on the top line, last-message preview + unread pill badge on the second line; name + preview go bold when unread. (3.1-A rounded-rect avatars already shipped in 9-1 — `ConversationAvatar` already uses `rounded-avatar`; we just keep using it.)

The current row renders a single line: `<ConversationAvatar> + <span>{label}</span> + unread badge`. We restructure to the prototype's two-line layout (`proto.jsx:95-107`). The existing `unread` computation (via `getUnreadCount`) is reused; we add the per-row timestamp (formatted from the last message's `sentAt`) and `getLastMessagePreview`.

**Files:**
- Modify: `src/components/sidebar.tsx` (the `sortedActive.map(...)` row body, currently lines ~294-337)
- Test: `tests/unit/components/sidebar-ia.test.tsx` (append a describe block + a seeded-conversation mock)

- [ ] **Step 1: Add the failing test**

The existing module-level `vi.mock("jazz-tools/react")` returns an empty `knownConversations`. To exercise a row, add a **second** test file with its own seeded mock so we don't disturb the header/tab tests. Create `tests/unit/components/sidebar-rows.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarTabProvider } from "@/components/sidebar-tab";

// One unread conversation + one read conversation. Bodies + sentAt drive the
// preview and timestamp; lastReadAt drives the unread badge.
const T0 = new Date("2026-06-20T09:00:00Z").getTime();
const T1 = new Date("2026-06-20T17:02:00Z").getTime();

const convUnread = {
  $jazz: { id: "co_conv_unread", owner: null },
  title: "rana",
  createdAt: new Date(T0).toISOString(),
  messages: [
    {
      body: "p99 down to 40ms",
      sentAt: new Date(T1),
      deleted: false,
      attachments: [],
      $jazz: { createdBy: "co_rana" },
    },
  ],
};
const convRead = {
  $jazz: { id: "co_conv_read", owner: null },
  title: "ada",
  createdAt: new Date(T0).toISOString(),
  messages: [
    {
      body: "ack — looks right",
      sentAt: new Date(T0),
      deleted: false,
      attachments: [],
      $jazz: { createdBy: "co_ada" },
    },
  ],
};

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "decima", avatar: null },
    root: {
      contactBook: [],
      knownConversations: [convUnread, convRead],
      // convRead's only message is at/below its cutoff → read; convUnread has
      // no cutoff entry → unread.
      lastReadAt: { co_conv_read: T0 + 1 },
    },
    $jazz: { id: "co_me" },
  }),
}));

// isArchived reads me.root… and the conversation; with treatNotLoadedAsArchived
// it must NOT treat our seeded convs as archived. Stub it to "never archived".
vi.mock("@/jazz/conversation", () => ({
  isArchived: () => false,
}));

// deriveConversationLabel falls back to the explicit `title` we set, so we do
// not need resolveDisplayName here; but the module imports it — stub it.
vi.mock("@/jazz/displayName", () => ({
  resolveDisplayName: () => "unused",
}));

async function renderSidebar() {
  const { Sidebar } = await import("@/components/sidebar");
  return render(
    <MemoryRouter>
      <SidebarTabProvider>
        <Sidebar />
      </SidebarTabProvider>
    </MemoryRouter>,
  );
}

describe("Sidebar chat rows (items 3.1-B/C/D)", () => {
  it("shows the last-message preview text on each row", async () => {
    const { getByTestId } = await renderSidebar();
    // Rows are sorted by last-message time desc → unread (T1) is row 0.
    expect(getByTestId("conversation-preview-0").textContent).toBe(
      "p99 down to 40ms",
    );
    expect(getByTestId("conversation-preview-1").textContent).toBe(
      "ack — looks right",
    );
  });

  it("shows a timestamp on each row", async () => {
    const { getByTestId } = await renderSidebar();
    // Locale-formatted HH:MM — assert it is non-empty and digit-bearing.
    expect(getByTestId("conversation-time-0").textContent).toMatch(/\d/);
  });

  it("shows the unread pill badge only on the unread row", async () => {
    const { getByTestId, queryByTestId } = await renderSidebar();
    expect(getByTestId("unread-badge-0").textContent).toBe("1");
    expect(queryByTestId("unread-badge-1")).toBeNull();
  });

  it("bolds the name on the unread row, not the read row", async () => {
    const { getByTestId } = await renderSidebar();
    expect(getByTestId("conversation-name-0").className).toMatch(
      /\bfont-semibold\b/,
    );
    expect(getByTestId("conversation-name-1").className).not.toMatch(
      /\bfont-semibold\b/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/components/sidebar-rows.test.tsx'`
Expected: FAIL — `conversation-preview-0` / `conversation-time-0` / `conversation-name-0` test ids do not exist yet (the row is still single-line).

- [ ] **Step 3: Add a timestamp formatter near the top of `sidebar.tsx`**

In `src/components/sidebar.tsx`, immediately **above** the `export function Sidebar()` line, add this module-scope helper:

```tsx
/**
 * Format a chat-row timestamp (Unit 9-3, item 3.1-C). Shows HH:MM for the
 * most recent message; returns "" when there is no message to time.
 * Locale-aware via toLocaleTimeString — matches the design's compact time.
 */
function formatRowTime(conversation: any): string {
  const msgs = conversation?.messages;
  const last = msgs && msgs.length ? msgs[msgs.length - 1] : null;
  const raw = last?.sentAt;
  if (!raw) return "";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
```

- [ ] **Step 4: Replace the chat-row `<Link>` body**

Find the row returned inside `sortedActive.map(...)`. It currently is:

```tsx
              return (
                <Link
                  key={i}
                  to={`/conversations/${convID}`}
                  className={`block p-2 hover:bg-accent rounded text-sm flex items-center gap-2 ${
                    unread > 0 ? "font-semibold" : ""
                  }`}
                  data-testid={`conversation-row-${i}`}
                  data-conversation-id={convID}
                >
                  <ConversationAvatar
                    conversationId={convID}
                    title={label}
                    icon={(c.conversation as any)?.icon}
                    size={32}
                    loadAs={me}
                    data-testid={`conversation-avatar-${i}`}
                  />
                  <span className="truncate flex-1">{label}</span>
                  {!isActive && unread > 0 && (
                    <span
                      data-testid={`unread-badge-${i}`}
                      className="flex-shrink-0 px-2 py-0.5 text-xs rounded-full bg-arcan-accent text-on-accent"
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
              );
```

Replace it with the two-line prototype layout (item 3.1-B/C/D — preview, timestamp, badge, bold-when-unread):

```tsx
              const preview = getLastMessagePreview(c.conversation);
              const time = formatRowTime(c.conversation);
              const showUnread = !isActive && unread > 0;
              return (
                <Link
                  key={i}
                  to={`/conversations/${convID}`}
                  className="flex items-center gap-3 p-2 rounded hover:bg-accent"
                  data-testid={`conversation-row-${i}`}
                  data-conversation-id={convID}
                >
                  <ConversationAvatar
                    conversationId={convID}
                    title={label}
                    icon={(c.conversation as any)?.icon}
                    size={38}
                    loadAs={me}
                    data-testid={`conversation-avatar-${i}`}
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    {/* top line: name + timestamp */}
                    <div className="flex items-center gap-2">
                      <span
                        data-testid={`conversation-name-${i}`}
                        className={`flex-1 truncate text-sm text-text ${
                          showUnread ? "font-semibold" : ""
                        }`}
                      >
                        {label}
                      </span>
                      <span
                        data-testid={`conversation-time-${i}`}
                        className="flex-shrink-0 text-xs text-dim"
                      >
                        {time}
                      </span>
                    </div>
                    {/* bottom line: preview + unread pill badge */}
                    <div className="flex items-center gap-2">
                      <span
                        data-testid={`conversation-preview-${i}`}
                        className={`flex-1 truncate text-xs ${
                          showUnread
                            ? "text-text-2 font-semibold"
                            : "text-dim"
                        }`}
                      >
                        {preview}
                      </span>
                      {showUnread && (
                        <span
                          data-testid={`unread-badge-${i}`}
                          className="flex-shrink-0 inline-flex items-center justify-center min-w-[17px] h-[17px] px-1.5 rounded-pill bg-arcan-accent text-on-accent text-xs font-bold"
                        >
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
```

- [ ] **Step 5: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/components/sidebar-rows.test.tsx'`
Expected: PASS — 4 tests pass.

- [ ] **Step 6: Verify the header/tab/FAB tests + token guard still pass**

Run: `nix-shell --run 'npm run check-tokens && npx vitest run tests/unit/components/sidebar-ia.test.tsx tests/unit/components/sidebar-separation.test.tsx'`
Expected: token guard passes; all sidebar-ia (8) + sidebar-separation (2) tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/sidebar.tsx tests/unit/components/sidebar-rows.test.tsx
git commit -m "feat(unit-9-3): chat rows get preview + timestamp + unread badge (items 3.1-B/C/D)"
```

---

## Task 8: Mobile bottom tabs — add leading icons (item 2-A) + confirm bottom-only (item 2-E)

Item 2-A applies to both surfaces: the mobile bottom tab bar gets the same leading icons. Item 2-E (mobile tabs bottom-only) is already satisfied — on mobile the only tab row visible is `MobileTabBar`; the `Sidebar`'s own top tab row renders inside the mobile `<Sidebar>` (mounted by `ConversationsRoute` as `md:hidden`)... wait: the mobile Sidebar DOES render its top tab row. We must confirm the design intent: the mobile list (`MobChatsList`, `hf-list.jsx`) has **no** top tab row — only the bottom `MobTabBar`. So on mobile the Sidebar's top tab row is the duplicate to suppress.

Hide the Sidebar's top tab row on mobile (`hidden md:flex`) so only the bottom bar shows; the bottom bar drives the shared tab state.

**Files:**
- Modify: `src/components/mobile-tab-bar.tsx` (add icons to both buttons)
- Modify: `src/components/sidebar.tsx` (make the `sidebar-tabs` row `hidden md:flex` for item 2-E)
- Test: `tests/unit/components/mobile-tab-bar.test.tsx` (append icon assertions)
- Test: `tests/unit/components/sidebar-ia.test.tsx` (append 2-E assertion)

- [ ] **Step 1: Add the failing tests**

Append to `tests/unit/components/mobile-tab-bar.test.tsx` (inside the existing `describe("MobileTabBar", …)` block, before its closing `})`):

```tsx
  it("renders a leading chat icon on the chats tab", () => {
    const { getByTestId } = renderAt("/");
    expect(
      getByTestId("mobile-tab-chats").querySelector('svg[data-icon="chat"]'),
    ).not.toBeNull();
  });

  it("renders a leading people icon on the contacts tab", () => {
    const { getByTestId } = renderAt("/");
    expect(
      getByTestId("mobile-tab-contacts").querySelector(
        'svg[data-icon="people"]',
      ),
    ).not.toBeNull();
  });
```

Append to `tests/unit/components/sidebar-ia.test.tsx`:

```tsx
describe("Sidebar IA — mobile tabs bottom-only (item 2-E)", () => {
  it("hides the sidebar's own top tab row on mobile (hidden md:flex)", async () => {
    const { getByTestId } = await renderSidebar();
    const tabs = getByTestId("sidebar-tabs");
    expect(tabs.className).toMatch(/\bhidden\b/);
    expect(tabs.className).toMatch(/\bmd:flex\b/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `nix-shell --run 'npx vitest run tests/unit/components/mobile-tab-bar.test.tsx tests/unit/components/sidebar-ia.test.tsx'`
Expected: FAIL — mobile-tab icon queries return null; `sidebar-tabs` className lacks `hidden` (it is currently `flex border-b border-hairline`).

- [ ] **Step 3: Add icons to the mobile tab bar**

In `src/components/mobile-tab-bar.tsx`, add the import at the top (after the existing imports):

```tsx
import { Icon } from "@/components/icon";
```

The chats button body currently is just the text `chats`:

```tsx
        onClick={() => setTab("chats")}
      >
        chats
      </button>
```

Replace the inner content (keep the surrounding button + className intact) so it reads:

```tsx
        onClick={() => setTab("chats")}
      >
        <Icon name="chat" size={20} />
        chats
      </button>
```

The contacts button body currently is just `contacts`:

```tsx
        onClick={() => setTab("contacts")}
      >
        contacts
      </button>
```

Replace it with:

```tsx
        onClick={() => setTab("contacts")}
      >
        <Icon name="people" size={20} />
        contacts
      </button>
```

(Both buttons already carry `flex flex-col items-center justify-center gap-1`, so the icon stacks above the label exactly like the design's `MobTab`.)

- [ ] **Step 4: Make the sidebar's top tab row mobile-hidden (item 2-E)**

In `src/components/sidebar.tsx`, find the tab-row container:

```tsx
      <div className="flex border-b border-hairline" data-testid="sidebar-tabs">
```

Replace it with (mobile shows only the bottom MobileTabBar; this top row is desktop-only):

```tsx
      <div
        className="hidden md:flex border-b border-hairline"
        data-testid="sidebar-tabs"
      >
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `nix-shell --run 'npx vitest run tests/unit/components/mobile-tab-bar.test.tsx tests/unit/components/sidebar-ia.test.tsx tests/unit/components/sidebar-separation.test.tsx'`
Expected: PASS — mobile-tab-bar (7), sidebar-ia (9), sidebar-separation (2). The sidebar-separation test asserts `sidebar-tabs` carries `border-b border-hairline` — still true after adding `hidden md:flex`.

- [ ] **Step 6: Commit**

```bash
git add src/components/mobile-tab-bar.tsx src/components/sidebar.tsx tests/unit/components/mobile-tab-bar.test.tsx tests/unit/components/sidebar-ia.test.tsx
git commit -m "feat(unit-9-3): mobile bottom tabs get icons + sidebar top tabs desktop-only (items 2-A, 2-E)"
```

---

## Task 9: Full-suite regression + token guard + typecheck

Confirm the whole unit suite, the token guard, and the TypeScript build are green after all IA changes.

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `nix-shell --run 'npx vitest run'`
Expected: PASS — entire `tests/unit/**` suite green (including the pre-existing `sidebar-separation`, `mobile-tab-bar`, `avatar`, `conversation-avatar-shape`, `app-shell` tests). No failures, no unhandled errors.

- [ ] **Step 2: Run the token guard**

Run: `nix-shell --run 'npm run check-tokens'`
Expected: `✓ no ad-hoc Tailwind color/typography classes detected`

- [ ] **Step 3: TypeScript typecheck**

Run: `nix-shell --run 'npx tsc --noEmit'`
Expected: no errors. (If `tsc --noEmit` is not the project's typecheck command, run `npm run build` instead — it invokes `tsc` then `vite build`; expect a clean build.)

- [ ] **Step 4: Commit (only if any lint/type fix was needed)**

If steps 1-3 surfaced a fix, commit it:

```bash
git add -A
git commit -m "chore(unit-9-3): fix regressions surfaced by full-suite verification"
```

If everything was already green, skip this commit.

---

## Self-Review Checklist

**1. Spec coverage** — every in-scope item maps to a task:

- **2-A · Tab icons** → Task 5 (sidebar tabs) + Task 8 (mobile bottom tabs). ✅
- **2-B · Header chrome (drop Lattice, add gear)** → Task 4. ✅
- **2-C · Add button → FAB** → Task 2 (component) + Task 4 (remove header `+`) + Task 6 (mount FAB). ✅
- **2-D · Remove footer settings link** → Task 6. ✅
- **2-E · Mobile tabs bottom-only** → Task 8 (sidebar top tab row → `hidden md:flex`). ✅
- **3.1-A · Rounded-rect avatars** → already shipped in 9-1 (`ConversationAvatar` uses `rounded-avatar`); Task 7 keeps using it (avatar size bumped 32→38 to match `proto.jsx:96`). ✅
- **3.1-B · Last-message preview** → Task 3 (`getLastMessagePreview`) + Task 7 (render). ✅
- **3.1-C · Timestamp top-right** → Task 7 (`formatRowTime` + render). ✅
- **3.1-D · Unread pill badge + bold-when-unread** → Task 7 (reuses `getUnreadCount`). ✅

**2. Placeholder scan** — no "TBD", "add error handling", "similar to Task N", or prose-only code steps. Every code step shows the full literal block. ✅

**3. Type consistency:**
- `Icon` prop is `name` (not `d`); used consistently as `<Icon name="…" />` in Tasks 2, 4, 5, 8. ✅
- `Fab` props are `label` + `onClick`; used consistently in Tasks 2 and 6. ✅
- `getLastMessagePreview(conversation)` — defined in Task 3, imported in Task 4's import edit, called in Task 7. ✅
- `formatRowTime(conversation)` — defined and called in Task 7. ✅
- `getUnreadCount` import is left untouched (already present); the new `getLastMessagePreview` import is added in Task 4 so Task 7 doesn't re-edit imports. ✅
- Test-id naming is consistent: `conversation-name-${i}`, `conversation-preview-${i}`, `conversation-time-${i}`, `unread-badge-${i}`, `sidebar-settings-gear`, `fab`. ✅

**4. Token compliance** — every color/shape class is a token utility: `bg-arcan-accent`, `text-on-accent`, `text-dim`, `text-text`, `text-text-2`, `border-hairline`, `border-arcan-accent`, `rounded-pill`, `rounded`, `shadow-level-2`, `rounded-avatar` (via `ConversationAvatar`). No raw `bg-white` / `text-gray-*` / `border-gray-*` / rgba literals in class strings. Task 4/6/7/9 each re-run `npm run check-tokens`. ✅

**5. Foundations respected** — AppShell + mobile `md:hidden` Sidebar mount untouched; no router/schema changes; `isArchived`, `deriveConversationLabel`, `resolveDisplayName`, `getUnreadCount`, `ConversationAvatar`, and the `lastReadAt` resolve all reused as-is. ✅
