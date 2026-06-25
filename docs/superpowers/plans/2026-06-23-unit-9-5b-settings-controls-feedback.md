# Unit 9-5b — Settings controls + feedback page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the appearance, notifications, and devices settings sections to the Soft Noir prototype cards (with a check-mark on the selected accent swatch and row icons), replace notification checkboxes/buttons with slider toggles, and collapse the inline feedback form into a single card row that navigates to a new dedicated `/settings/feedback` route built to match the prototype `FeedbackScreen`.

**Architecture:** This is the **controls + feedback half** of the Unit 9-5 settings rebuild (spec § 9-5, items 4-E / 4-F / 4-G / 4-H). It **consumes the shared settings kit delivered by Unit 9-5a** (`src/routes/settings/settings-kit.tsx` — `Icon`, `Card`, `SectionLabel`, `SRow`, `Toggle`, plus the `accentCheckColor` luminance helper) and slots the appearance / notifications / devices / feedback-row sections into the `SettingsBody` scaffold that 9-5a establishes in `src/routes/settings/index.tsx`. The feedback form moves wholesale to a new route component under the existing `/settings/*` react-router dispatcher; its submission logic (multipart POST to `/api/feedback`) is preserved unchanged.

**Tech Stack:** React 18 + TypeScript (strict), Tailwind v3 (token utilities only — `bg-panel`, `text-text`, `text-dim`, `border-hairline`, `text-arcan-accent`, etc.), react-router-dom v6, Jazz/CoJSON 0.20.18 (`.$jazz.set`, deep `resolve`), Vitest (`tests/unit/`) + Playwright (`tests/e2e/`). Tests run inside `nix-shell`.

---

## Dependency on Unit 9-5a (READ THIS FIRST)

Unit 9-5a is the **structure + account half** of the settings rebuild. It is **not yet written at the time this plan was authored**, so this plan declares the exact kit interface it depends on. When executing, **first confirm 9-5a has merged and exports match**; if a name differs, adapt the import — the behavior contracts below are what matter.

**9-5a is expected to provide `src/routes/settings/settings-kit.tsx`:**

```tsx
// ---- Icon ----
// A single inline-SVG icon component keyed by name. The real codebase has NO
// icon library today (no lucide, no shared Icon). 9-5a introduces this, porting
// the path set from design/proto.jsx's window.Icon. Names used by 9-5b:
//   "moon" | "sun" | "sparkle" | "check" | "bell" | "device" | "plus"
//   | "message" | "chev" | "send" | "paperclip" | "image" | "close"
export interface IconProps {
  d: string;                 // icon name (proto calls this prop `d`)
  className?: string;        // for token color: e.g. "text-text-2", "text-arcan-accent"
  color?: string;            // explicit CSS color override (used for the contrast-aware check)
  size?: number;             // px; default 17
  sw?: number;               // stroke width; default 1.8
}
export function Icon(props: IconProps): JSX.Element;

// ---- Card ----
// Connected container: panel bg, hairline border, rounded, overflow-hidden so
// the hairline-divided rows clip cleanly. Renders children as stacked rows.
export function Card(props: { children: React.ReactNode; className?: string }): JSX.Element;

// ---- SectionLabel ----
// Uppercase, letter-spaced, dim section caption rendered ABOVE a Card.
export function SectionLabel(props: { children: React.ReactNode }): JSX.Element;

// ---- SRow ----
// One settings row inside a Card. Hairline bottom border unless `last`.
// `onClick` makes the whole row a button. `right` renders a trailing control
// (Toggle / Chev / value / avatar). `danger` paints label + icon red.
export interface SRowProps {
  icon?: string;             // Icon name; rendered left at size 17
  iconColor?: string;        // optional className for the icon (e.g. "text-arcan-accent")
  label: string;
  sub?: string;              // secondary dim line under the label
  value?: string;            // right-aligned dim value text
  right?: React.ReactNode;   // trailing control node (takes precedence visual slot)
  danger?: boolean;
  last?: boolean;            // suppress bottom hairline
  onClick?: () => void;      // whole-row click → renders as <button>
  testId?: string;           // data-testid passthrough
}
export function SRow(props: SRowProps): JSX.Element;

// ---- Toggle (slider) ----
// The PToggle slider from the prototype: 36×21 pill track, 15px knob that
// slides left↔right. `on` drives color (accent fill vs panel-2) + knob position.
// `onClick` fires on tap. `disabled` dims + blocks clicks.
export interface ToggleProps {
  on: boolean;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}
export function Toggle(props: ToggleProps): JSX.Element;

// ---- accentCheckColor ----
// Contrast-aware foreground for the check-mark drawn on a colored accent swatch.
// Returns "#0b0d14" on light swatches, "#fff" on dark ones (proto: lum(col) > 0.55).
export function accentCheckColor(swatchHex: string): string;
```

**If `accentCheckColor` is NOT exported by 9-5a**, this plan defines it locally in Task 5b.1 (see that task). All other kit pieces are hard dependencies — do not re-implement them here.

**9-5a is also expected to leave these insertion points in `src/routes/settings/index.tsx`:** a `SettingsBody`-style layout that renders, in order, the account `Card`, then a `<FeedbackRow />`, then `<AppearanceSection />`, then `<NotificationsSection />`, then `<DevicesSection />`, then the sign-out card. 9-5b owns `FeedbackRow`, `AppearanceSection`, `NotificationsSection`, `DevicesSection`, and the `/settings/feedback` route. If 9-5a wired placeholder versions, 9-5b replaces them.

**Prototype source of truth (cite line numbers when in doubt):**
- `design/proto.jsx` `SettingsScreen` ~ lines 261–317 (appearance card 278–299, notifications 300–305, devices 306–311), `FeedbackScreen` ~ lines 479–534.
- `design/hf-settings.jsx` `AppearanceCard` lines 53–88, notifications card lines 116–121, `FeedbackBody` lines 155–200.

---

## Existing code this plan modifies

- `src/routes/settings/appearance-section.tsx` — working theme toggle + accent picker; restyle into `Card`, add check-mark + row icons.
- `src/routes/settings/notifications-section.tsx` — checkbox + Enable/Disable buttons; replace with two `Toggle` sliders. **Preserve the permission flow** in `handleEnableBrowser` (calls `Notification.requestPermission()` unconditionally; `granted` → `prefs.browser = true`; `denied` → error + stays off; `default` → no change). Effective state today: `prefs.browser && Notification.permission === "granted"`.
- `src/routes/settings/devices-section.tsx` — list + top "link new device" button; restyle to `Card`, move the link row to the BOTTOM.
- `src/routes/settings/feedback-section.tsx` — full inline form (message / category / attachments / submit) POSTing to `/api/feedback`. **Move this UI to a new route**; replace the section with a single `FeedbackRow`.
- `src/routes/settings/index.tsx` — the `/settings/*` react-router dispatcher; add the `feedback` child route. (9-5a owns the landing-page body order; 9-5b adds the route + the row.)

**Backend note (out of scope, do not change):** `/api/feedback` (`api/src/feedback-route.ts`) derives the submitter email from the authenticated session (`session.user.email`) and accepts only `message`, `category`, and `attachment` form fields. The prototype shows an "email · optional" field "for follow-up". The current real form has **no** email field. This plan **renders the optional email field per the prototype** and appends it to the FormData as `email`; the server currently ignores unknown fields (harmless). Wiring the server to read it is a follow-up, not part of 9-5b.

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/routes/settings/appearance-section.tsx` | Appearance card: theme segmented toggle + accent swatches w/ check-mark | Modify |
| `src/routes/settings/notifications-section.tsx` | Notifications card: sound slider + browser-permission slider | Modify |
| `src/routes/settings/devices-section.tsx` | Devices card: device rows + bottom "link a device" row | Modify |
| `src/routes/settings/feedback-section.tsx` | Single `FeedbackRow` card (navigates to route) | Rewrite |
| `src/routes/settings/feedback-route.tsx` | Dedicated `/settings/feedback` page (full form) | Create |
| `src/routes/settings/index.tsx` | Add `feedback` child route to the dispatcher | Modify |
| `tests/unit/feedback-row.test.tsx` | Unit: FeedbackRow renders + navigates | Create |
| `tests/unit/appearance-accent-check.test.tsx` | Unit: check-mark only on selected swatch | Create |
| `tests/e2e/settings-controls.spec.ts` | E2E: feedback route nav + submit, notification sliders, devices order | Create |

---

## Phase 0 · Setup

### Task 0.1: Branch + confirm the 9-5a kit

**Files:** none (verification only)

- [ ] **Step 1: Branch off main**

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git checkout main && git pull --ff-only
git checkout -b unit-9-5b-settings-controls-feedback
```

- [ ] **Step 2: Confirm the 9-5a kit exists and exports the names this plan uses**

Run:

```bash
grep -nE "export function (Icon|Card|SectionLabel|SRow|Toggle)|export function accentCheckColor" src/routes/settings/settings-kit.tsx
```

Expected: lines for `Icon`, `Card`, `SectionLabel`, `SRow`, `Toggle`. `accentCheckColor` may or may not appear — if absent, Task 5b.1 defines it locally.

If `settings-kit.tsx` does not exist, **stop**: 9-5a has not merged. Do not implement the kit here.

- [ ] **Step 3: Confirm baseline is green**

Run:

```bash
nix-shell --run "npm run check-tokens && npm run test"
```

Expected: token check passes; vitest suite passes.

---

## Phase 1 · Appearance (4-E)

### Task 1.1: Add a failing unit test for the accent check-mark

**Files:**
- Test: `tests/unit/appearance-accent-check.test.tsx` (create)

The selected accent swatch must render a `check` Icon; non-selected swatches must not. We test the rendering logic in isolation by extracting a tiny pure helper from the section so the test doesn't need the full Jazz/account stack.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/appearance-accent-check.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AccentSwatches } from "@/routes/settings/appearance-section";

describe("AccentSwatches", () => {
  it("renders a check-mark only on the selected swatch", () => {
    render(<AccentSwatches accent="violet" onPick={() => {}} />);
    // Every swatch is a labelled button (aria-label = accent key).
    expect(screen.getByLabelText("violet")).toBeInTheDocument();
    // The selected swatch carries the check; identify via a test id.
    expect(screen.getByTestId("accent-check-violet")).toBeInTheDocument();
    expect(screen.queryByTestId("accent-check-tokyo")).toBeNull();
  });

  it("moves the check-mark when the selection changes", () => {
    const { rerender } = render(<AccentSwatches accent="tokyo" onPick={() => {}} />);
    expect(screen.getByTestId("accent-check-tokyo")).toBeInTheDocument();
    rerender(<AccentSwatches accent="rose" onPick={() => {}} />);
    expect(screen.getByTestId("accent-check-rose")).toBeInTheDocument();
    expect(screen.queryByTestId("accent-check-tokyo")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:

```bash
nix-shell --run "npx vitest run tests/unit/appearance-accent-check.test.tsx"
```

Expected: FAIL — `AccentSwatches` is not exported from `appearance-section`.

### Task 1.2: Restyle the appearance section + extract `AccentSwatches`

**Files:**
- Modify: `src/routes/settings/appearance-section.tsx`

Rewrite the section to use the kit `Card` + row icons (moon/sun for theme, sparkle for accent) and to render the check-mark on the selected swatch. Extract `AccentSwatches` as a pure, exported sub-component so Task 1.1's test can drive it without an account. Keep the existing `apply()` write logic (theme/accent → `appearance.$jazz.set` + `useTheme`/`useAccent` + success toast) and the loading skeleton.

- [ ] **Step 1: Replace the file contents**

```tsx
// src/routes/settings/appearance-section.tsx
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useTheme, type Theme } from "@/styles/use-theme";
import { useAccent, ACCENT_KEYS, type Accent } from "@/styles/use-accent";
import { useToast } from "@/components/toast";
import { Skel } from "@/components/skeleton";
import { Card, SectionLabel, Icon, accentCheckColor } from "./settings-kit";

const ACCENT_SWATCH: Record<Accent, string> = {
  tokyo:  "#7aa2f7",
  violet: "#bb9af7",
  teal:   "#73daca",
  lime:   "#9ece6a",
  amber:  "#e0af68",
  rose:   "#f7768e",
};

/**
 * AccentSwatches: the six colored swatch buttons. Pure presentation so it can
 * be unit-tested without the Jazz account. The selected swatch renders a
 * contrast-aware check-mark (proto.jsx SettingsScreen line 294).
 */
export function AccentSwatches({
  accent,
  onPick,
}: {
  accent: Accent;
  onPick: (a: Accent) => void;
}) {
  return (
    <div className="flex gap-3 mt-3.5 pl-7" data-testid="appearance-accent-picker">
      {ACCENT_KEYS.map((k) => {
        const col = ACCENT_SWATCH[k];
        const on = accent === k;
        return (
          <button
            key={k}
            data-testid={`accent-${k}`}
            aria-label={k}
            title={k}
            onClick={() => onPick(k)}
            className="w-7 h-7 rounded-pill flex items-center justify-center shrink-0"
            style={{
              background: col,
              border: on ? "2px solid var(--color-text)" : "2px solid transparent",
              boxShadow: on ? "0 0 0 2px var(--color-panel)" : "none",
            }}
          >
            {on && (
              <Icon
                d="check"
                size={14}
                sw={3}
                color={accentCheckColor(col)}
                // testid so unit tests can assert presence per swatch
                data-testid={`accent-check-${k}`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AppearanceSection() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { settings: { appearance: true } } },
  });
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const toast = useToast();

  if (!me.$isLoaded) {
    return (
      <div data-testid="appearance-section-loading">
        <SectionLabel>appearance</SectionLabel>
        <Card>
          <div className="flex flex-col gap-4 px-3.5 py-3">
            <div className="flex items-center gap-3">
              <Skel w="40%" h={14} />
              <Skel w={80} h={24} r={999} />
            </div>
            <div className="flex flex-col gap-2">
              <Skel w="40%" h={14} />
              <div className="flex gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skel key={i} w={28} h={28} r={999} />
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const apply = (next: { theme?: Theme; accent?: Accent }) => {
    const appearance = me.root.settings?.appearance;
    if (!appearance) return;
    if (next.theme) {
      setTheme(next.theme);
      (appearance as any).$jazz.set("theme", next.theme);
    }
    if (next.accent) {
      setAccent(next.accent);
      (appearance as any).$jazz.set("accent", next.accent);
    }
    toast({ icon: "check", text: "appearance updated", tone: "success" });
  };

  return (
    <div>
      <SectionLabel>appearance</SectionLabel>
      <Card>
        {/* theme — row icon is moon/sun (proto line 281) */}
        <div className="flex items-center gap-3 px-3.5 py-3 border-b border-hairline">
          <Icon d={theme === "dark" ? "moon" : "sun"} className="text-text-2" size={17} />
          <span className="flex-1 text-sm text-text">theme</span>
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
                  className={`px-3 py-1 rounded-pill text-xs font-semibold ${on ? "bg-arcan-accent text-on-accent" : "text-text-2"}`}
                  onClick={() => apply({ theme: t })}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* accent — row icon is sparkle (proto line 289) */}
        <div className="px-3.5 py-3">
          <div className="flex items-center gap-3">
            <Icon d="sparkle" className="text-text-2" size={17} />
            <span className="flex-1 text-sm text-text">accent color</span>
            <span className="text-xs text-arcan-accent">{accent}</span>
          </div>
          <AccentSwatches accent={accent} onPick={(a) => apply({ accent: a })} />
        </div>
      </Card>
    </div>
  );
}
```

> **Note on `data-testid` on `Icon`:** the `Icon` props interface (from 9-5a) must forward unknown DOM attributes (or accept `data-testid`) for `accent-check-{k}` to land in the DOM. If 9-5a's `Icon` does NOT spread extra props, wrap the check in a `<span data-testid={`accent-check-${k}`}>` instead. Adjust here; the test only requires the test-id to be queryable.

- [ ] **Step 2: Run the unit test to verify it passes**

Run:

```bash
nix-shell --run "npx vitest run tests/unit/appearance-accent-check.test.tsx"
```

Expected: PASS (both cases).

- [ ] **Step 3: Token guard**

Run:

```bash
nix-shell --run "npm run check-tokens"
```

Expected: PASS. (`var(--color-text)` / `var(--color-panel)` inline styles are token references, not raw colors; the swatch hexes live in the `ACCENT_SWATCH` map, which is data, not a Tailwind class.)

- [ ] **Step 4: Commit**

```bash
git add src/routes/settings/appearance-section.tsx tests/unit/appearance-accent-check.test.tsx
git commit -m "ui(unit-9-5b): appearance card — kit Card + row icons + selected-accent check-mark"
```

---

## Phase 2 · Notifications as slider toggles (4-G)

The notifications schema (`src/jazz/schema/ArcanAccount.ts`) has exactly two booleans: `sound` and `browser`. Per the task scope the two toggles are **"sound on new messages"** (`sound`) and **"browser notifications enabled"** (`browser`) — there is no `mentions` field, so the prototype's "mentions only" row is replaced by the browser-permission slider. Preserve the existing permission logic exactly.

### Task 2.1: Failing E2E expectations for the slider toggles

We extend the existing notification e2e rather than unit-testing, because the behavior (permission round-trip) needs a real browser `Notification` API. Add a new spec file scoped to 9-5b controls.

**Files:**
- Test: `tests/e2e/settings-controls.spec.ts` (create — also covers Phase 3 + 4; built up across tasks)

- [ ] **Step 1: Write the failing notifications portion**

```ts
// tests/e2e/settings-controls.spec.ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test.describe("Unit 9-5b — settings controls + feedback", () => {
  test("browser-notification slider flips on when permission is granted", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ permissions: ["notifications"] });
    const page = await ctx.newPage();
    try {
      await page.goto("/");
      await createAccount(page, "Alice");
      await page.goto("/settings");

      const slider = page.getByTestId("browser-toggle");
      await expect(slider).toBeVisible({ timeout: 10_000 });
      // starts off
      await expect(slider).toHaveAttribute("aria-checked", "false");
      await slider.click();
      // granted → reflects real permission → on
      await expect(slider).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test("browser-notification slider stays off when permission is denied", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.addInitScript(() => {
        if (typeof (globalThis as any).Notification !== "undefined") {
          (globalThis as any).Notification.requestPermission = () =>
            Promise.resolve("denied");
        }
      });
      await page.goto("/");
      await createAccount(page, "Bob");
      await page.goto("/settings");

      const slider = page.getByTestId("browser-toggle");
      await slider.click();
      await expect(slider).toHaveAttribute("aria-checked", "false");
      await expect(page.getByTestId("browser-error")).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("sound slider round-trips through reload", async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto("/");
      await createAccount(page, "Cara");
      await page.goto("/settings");
      const sound = page.getByTestId("sound-toggle");
      await expect(sound).toHaveAttribute("aria-checked", "false");
      await sound.click();
      await expect(sound).toHaveAttribute("aria-checked", "true");
      await page.reload();
      await expect(page.getByTestId("sound-toggle")).toHaveAttribute(
        "aria-checked",
        "true",
        { timeout: 10_000 },
      );
    } finally {
      await ctx.close();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
nix-shell --run "npx playwright test tests/e2e/settings-controls.spec.ts -g 'slider'"
```

Expected: FAIL — `getByTestId("browser-toggle")` / `sound-toggle` (as a slider with `aria-checked`) do not exist yet (current UI uses a checkbox + buttons).

> **`aria-checked` requirement:** the kit `Toggle` must render `role="switch"` + `aria-checked={on}` + the `data-testid` it's given, so these assertions are stable. If 9-5a's `Toggle` lacks `aria-checked`, file it as a 9-5a follow-up and add a wrapping element with the attribute here; do not change the kit from this plan.

### Task 2.2: Rewrite the notifications section with sliders

**Files:**
- Modify: `src/routes/settings/notifications-section.tsx`

Replace the checkbox + Enable/Disable buttons with two `Toggle` sliders inside a `Card`, while preserving the permission flow verbatim. The sound slider toggles `prefs.sound`. The browser slider: when currently off, clicking calls `handleEnableBrowser()` (unchanged); when currently on (effective), clicking calls `handleDisableBrowser()`. The slider's `on` state mirrors `browserEffective = prefs.browser && permissionState === "granted"`.

- [ ] **Step 1: Replace the file contents**

```tsx
// src/routes/settings/notifications-section.tsx
import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useToast } from "@/components/toast";
import { Skel } from "@/components/skeleton";
import { Card, SectionLabel, SRow, Toggle } from "./settings-kit";

/**
 * NotificationsSection: slider toggles for notification preferences (Unit 9-5b,
 * 4-G). Two options:
 *   • sound on new messages  → settings.notifications.sound
 *   • browser notifications  → settings.notifications.browser, gated on the
 *     real Notification permission.
 *
 * Browser slider flow (preserved from Slice 8):
 *   - Flip ON  → Notification.requestPermission():
 *       "granted" → prefs.browser = true (slider shows ON)
 *       "denied"  → inline error, slider stays OFF
 *       "default" → user dismissed, no state change
 *   - Flip OFF → prefs.browser = false (OS permission untouched)
 * Effective ON = prefs.browser && Notification.permission === "granted".
 */
export function NotificationsSection() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { settings: { notifications: true } } },
  });
  const [permissionState, setPermissionState] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );
  const [requestError, setRequestError] = useState<string | null>(null);
  const toast = useToast();

  if (!me.$isLoaded || !(me.root as any)?.settings?.notifications) {
    return (
      <div data-testid="notifications-section-loading">
        <SectionLabel>notifications</SectionLabel>
        <Card>
          <div className="flex flex-col gap-3 px-3.5 py-3">
            <Skel w="65%" h={14} />
            <Skel w="50%" h={14} />
          </div>
        </Card>
      </div>
    );
  }

  const prefs = (me.root as any).settings.notifications;
  const apiSupported = typeof Notification !== "undefined";
  const browserEffective = prefs.browser && permissionState === "granted";

  function handleSoundToggle() {
    prefs.$jazz.set("sound", !prefs.sound);
    toast({ icon: "check", text: "notifications updated", tone: "success" });
  }

  async function handleEnableBrowser() {
    setRequestError(null);
    if (!apiSupported) {
      setRequestError("Browser notifications are not available in this environment.");
      return;
    }
    try {
      // Call requestPermission unconditionally — checking Notification.permission
      // first isn't reliable across browsers (Playwright reports "denied" via the
      // getter even when a fresh request resolves "granted"). The browser decides
      // whether to prompt or short-circuit to the previously-set value.
      const result = await Notification.requestPermission();
      setPermissionState(result);
      if (result === "granted") {
        prefs.$jazz.set("browser", true);
        toast({ icon: "check", text: "notifications updated", tone: "success" });
      } else if (result === "denied") {
        setRequestError(
          "Notifications were declined. Re-enable in your browser settings to try again.",
        );
      }
      // "default" → user dismissed; no state change.
    } catch (err) {
      setRequestError(
        err instanceof Error ? err.message : "Failed to request permission.",
      );
    }
  }

  function handleDisableBrowser() {
    prefs.$jazz.set("browser", false);
    toast({ icon: "check", text: "notifications updated", tone: "success" });
  }

  function handleBrowserToggle() {
    if (browserEffective) handleDisableBrowser();
    else void handleEnableBrowser();
  }

  return (
    <div>
      <SectionLabel>notifications</SectionLabel>
      <Card>
        <SRow
          icon="bell"
          label="sound on new messages"
          right={
            <Toggle on={prefs.sound} onClick={handleSoundToggle} testId="sound-toggle" />
          }
        />
        <SRow
          icon="bell"
          label="browser notifications"
          sub={
            !apiSupported
              ? "not available in this environment"
              : "system alerts when a tab is hidden"
          }
          right={
            <Toggle
              on={browserEffective}
              onClick={handleBrowserToggle}
              disabled={!apiSupported}
              testId="browser-toggle"
            />
          }
          last
        />
      </Card>
      {requestError && (
        <p data-testid="browser-error" className="mt-2 text-sm text-red">
          {requestError}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the notification e2e portion to verify it passes**

Run:

```bash
nix-shell --run "npx playwright test tests/e2e/settings-controls.spec.ts -g 'slider'"
```

Expected: PASS — all three slider scenarios.

- [ ] **Step 3: Confirm the legacy Slice 8 e2e still passes (it targets old test-ids)**

Run:

```bash
nix-shell --run "npx playwright test tests/e2e/notification-permission.spec.ts"
```

Expected: This **will fail** — it asserts `enable-browser-notifications` / `browser-status` which we removed. Update that spec to the new slider test-ids: replace `getByTestId("enable-browser-notifications").click()` with `getByTestId("browser-toggle").click()`, and replace the `browser-status` text assertions with `await expect(page.getByTestId("browser-toggle")).toHaveAttribute("aria-checked", "true"|"false")`. Re-run until green. (Do not delete the spec — it has a denied-path + sound round-trip worth keeping; just retarget the selectors.)

- [ ] **Step 4: Token guard**

Run:

```bash
nix-shell --run "npm run check-tokens"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings/notifications-section.tsx tests/e2e/settings-controls.spec.ts tests/e2e/notification-permission.spec.ts
git commit -m "ui(unit-9-5b): notifications as slider toggles; preserve permission flow"
```

---

## Phase 3 · Devices card with bottom link row (4-H)

### Task 3.1: Add the failing devices e2e expectation

**Files:**
- Modify: `tests/e2e/settings-controls.spec.ts` (append a test to the existing describe block)

The "link a device" row must be the LAST row of the devices card (below the device list), and must navigate to the pair route.

- [ ] **Step 1: Append the test**

```ts
  test("devices card shows the link-device row at the bottom and it navigates to pairing", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto("/");
      await createAccount(page, "Dana");
      await page.goto("/settings");

      const card = page.getByTestId("devices-card");
      await expect(card).toBeVisible({ timeout: 10_000 });

      // The link row is the last child row of the card.
      const linkRow = page.getByTestId("link-device-row");
      await expect(linkRow).toBeVisible();
      // It is positioned after the (at least one) device row in DOM order.
      const deviceRow = page.getByTestId("device-row-0");
      await expect(deviceRow).toBeVisible();
      const order = await card.evaluate((el) => {
        const ids = Array.from(el.querySelectorAll("[data-testid]")).map(
          (n) => (n as HTMLElement).dataset.testid,
        );
        return {
          device: ids.indexOf("device-row-0"),
          link: ids.indexOf("link-device-row"),
        };
      });
      expect(order.link).toBeGreaterThan(order.device);

      await linkRow.click();
      await expect(page).toHaveURL(/\/pair\?role=initiator/);
    } finally {
      await ctx.close();
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
nix-shell --run "npx playwright test tests/e2e/settings-controls.spec.ts -g 'link-device'"
```

Expected: FAIL — `devices-card` / `link-device-row` / `device-row-0` test-ids don't exist (current UI uses a top button + `<ul>`).

### Task 3.2: Restyle the devices section to the prototype card

**Files:**
- Modify: `src/routes/settings/devices-section.tsx`

Render the device list as `SRow`s inside a `Card`, then the "link a device" row LAST (proto line 309: `icon="plus" label="link a device"` as the final row). Preserve the soft-revoke `confirm()` + `$jazz.set("revoked", true)` and the current-device guard. Use `useNavigate` for the link row (kit rows fire `onClick`, not `<Link>`).

- [ ] **Step 1: Replace the file contents**

```tsx
// src/routes/settings/devices-section.tsx
import { useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import type { Account } from "jazz-tools";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Button } from "@/components/ui/button";
import { getCurrentSessionFingerprint } from "@/auth/session";
import { Skel } from "@/components/skeleton";
import { Card, SectionLabel, SRow } from "./settings-kit";

/**
 * DevicesSection (Unit 9-5b, 4-H): device rows in a Card, with the
 * "link a device" row at the BOTTOM (proto.jsx SettingsScreen line 309).
 *
 * Soft revoke: flips device.revoked = true and hides the device. Full
 * cryptographic revocation (secret rotation) is deferred — see NOX-10.
 */
export function DevicesSection() {
  const navigate = useNavigate();
  const me = useAccount(ArcanAccount, {
    resolve: { root: { devices: { $each: true } } },
  });

  if (!me.$isLoaded) {
    return (
      <div data-testid="devices-section-loading">
        <SectionLabel>devices</SectionLabel>
        <Card>
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center justify-between px-3.5 py-3">
              <div className="flex flex-col gap-1">
                <Skel w={140} h={12} />
                <Skel w={90} h={10} />
              </div>
              <Skel w={72} h={28} r={6} />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  const allDevices = me.root.devices;
  const devices = allDevices.filter((d) => d && !d.revoked);

  let currentFingerprint: string | null = null;
  try {
    currentFingerprint = getCurrentSessionFingerprint(me as unknown as Account);
  } catch {
    // Non-local account — guard defensively.
  }

  function handleRevoke(idx: number) {
    const device = devices[idx];
    if (!device) return;
    const confirmed = confirm(
      "Forget this device? It stays hidden from your list, but anything already synced to it remains readable. Full cryptographic revocation lands in a later release.",
    );
    if (!confirmed) return;
    (device as any).$jazz.set("revoked", true);
  }

  return (
    <div>
      <SectionLabel>devices</SectionLabel>
      <Card data-testid="devices-card">
        {devices.length === 0 ? (
          <SRow icon="device" label="no devices found" />
        ) : (
          devices.map((device, idx) => {
            const isCurrentDevice =
              currentFingerprint !== null &&
              (device as any).sessionFingerprint === currentFingerprint;
            const added =
              device.addedAt instanceof Date
                ? device.addedAt.toLocaleDateString()
                : new Date(device.addedAt).toLocaleDateString();
            return (
              <SRow
                key={idx}
                testId={`device-row-${idx}`}
                icon="device"
                label={device.label + (isCurrentDevice ? " · this device" : "")}
                sub={`added ${added}`}
                right={
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`revoke-device-btn-${idx}`}
                    onClick={() => handleRevoke(idx)}
                    disabled={isCurrentDevice}
                    title={
                      isCurrentDevice
                        ? "This is your current device — use Sign out instead."
                        : undefined
                    }
                  >
                    forget
                  </Button>
                }
              />
            );
          })
        )}
        {/* link row LAST (proto.jsx line 309) */}
        <SRow
          testId="link-device-row"
          icon="plus"
          label="link a device"
          onClick={() => navigate("/pair?role=initiator")}
          last
        />
      </Card>
      <p className="mt-3 text-xs text-dim leading-relaxed max-w-xl">
        forgetting a device hides it here, but it can still read everything it has already synced.
        full cryptographic revocation lands in the upcoming overhaul — see NOX-10.
      </p>
    </div>
  );
}
```

> **`Card` extra-attr note:** if 9-5a's `Card` does not forward `data-testid`, wrap its children's container or add a `className`-only marker; the e2e queries `devices-card`. Confirm the kit forwards `data-testid` (declared in the kit interface as `className?`-only above — so if it lacks a passthrough, add `data-testid` support to the kit as part of 9-5a, OR target the inner `SectionLabel`+`Card` via a stable wrapper `<div data-testid="devices-card">` around the `Card`). Prefer the wrapper to avoid editing the kit.

- [ ] **Step 2: Run the devices e2e to verify it passes**

Run:

```bash
nix-shell --run "npx playwright test tests/e2e/settings-controls.spec.ts -g 'link-device'"
```

Expected: PASS.

- [ ] **Step 3: Token guard**

Run:

```bash
nix-shell --run "npm run check-tokens"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/settings/devices-section.tsx tests/e2e/settings-controls.spec.ts
git commit -m "ui(unit-9-5b): devices card — kit rows, link-a-device row at bottom"
```

---

## Phase 4 · Feedback row + dedicated route (4-F)

### Task 4.1: Failing unit test for the collapsed `FeedbackRow`

**Files:**
- Test: `tests/unit/feedback-row.test.tsx` (create)

The inline form collapses to a single card row ("give feedback" / "report a bug or share an idea" + chevron) that navigates to `/settings/feedback`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/feedback-row.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { FeedbackRow } from "@/routes/settings/feedback-section";

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/settings" element={<FeedbackRow />} />
        <Route path="/settings/feedback" element={<div>FEEDBACK PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FeedbackRow", () => {
  it("renders the collapsed row copy", () => {
    renderAt("/settings");
    expect(screen.getByText("give feedback")).toBeInTheDocument();
    expect(screen.getByText("report a bug or share an idea")).toBeInTheDocument();
  });

  it("navigates to /settings/feedback on click", async () => {
    const user = userEvent.setup();
    renderAt("/settings");
    await user.click(screen.getByTestId("feedback-row"));
    expect(screen.getByText("FEEDBACK PAGE")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
nix-shell --run "npx vitest run tests/unit/feedback-row.test.tsx"
```

Expected: FAIL — `FeedbackRow` not exported from `feedback-section`.

### Task 4.2: Replace `feedback-section.tsx` with the collapsed row

**Files:**
- Rewrite: `src/routes/settings/feedback-section.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
// src/routes/settings/feedback-section.tsx
import { useNavigate } from "react-router-dom";
import { Card, SRow, Chev } from "./settings-kit";

/**
 * FeedbackRow (Unit 9-5b, 4-F): the inline feedback form has moved to the
 * dedicated /settings/feedback route. This is the single card row that links
 * to it. Positioned directly below the account card, above appearance
 * (proto.jsx SettingsScreen line 277).
 */
export function FeedbackRow() {
  const navigate = useNavigate();
  return (
    <Card>
      <SRow
        testId="feedback-row"
        icon="message"
        iconColor="text-arcan-accent"
        label="give feedback"
        sub="report a bug or share an idea"
        right={<Chev />}
        onClick={() => navigate("/settings/feedback")}
        last
      />
    </Card>
  );
}
```

> **`Chev` note:** if 9-5a does not export a `Chev` helper, render `<Icon d="chev" className="text-dim" size={15} />` directly instead (import `Icon` from the kit).

- [ ] **Step 2: Update `index.tsx` to use `FeedbackRow`**

In `src/routes/settings/index.tsx`, the landing body (owned by 9-5a) imports the section components. Change the feedback import + usage:

Replace the import line:

```tsx
import { FeedbackSection } from "./feedback-section";
```

with:

```tsx
import { FeedbackRow } from "./feedback-section";
```

and in the landing-page body replace `<FeedbackSection />` with `<FeedbackRow />` (it should sit directly after the account card, before `<AppearanceSection />`).

- [ ] **Step 3: Run the unit test to verify it passes**

Run:

```bash
nix-shell --run "npx vitest run tests/unit/feedback-row.test.tsx"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/settings/feedback-section.tsx src/routes/settings/index.tsx tests/unit/feedback-row.test.tsx
git commit -m "ui(unit-9-5b): collapse inline feedback to a single card row"
```

### Task 4.3: Create the dedicated `/settings/feedback` route page

**Files:**
- Create: `src/routes/settings/feedback-route.tsx`

Build the full feedback page matching `FeedbackScreen` (proto.jsx 479–534) / `FeedbackBody` (hf-settings 155–200): a PaneHeader-style "give feedback" header with a back affordance, intro line, textarea ("your feedback"), category chips (bug/idea/question/note), attachment dropzone, optional email field, and submit. **Preserve the `/api/feedback` submission logic verbatim** (multipart POST, `MAX_TOTAL_BYTES` cap, success/error toasts). Categories use the existing `CATEGORY_LABEL` map so the server still receives `Bug`/`Idea`/`Question`/`Note`.

The page renders inside the AppShell. Use a back link to `/settings` for the header.

- [ ] **Step 1: Create the file**

```tsx
// src/routes/settings/feedback-route.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/toast";
import { Icon } from "./settings-kit";

const CATEGORIES = ["bug", "idea", "question", "note"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABEL: Record<Category, string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  note: "Note",
};

const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

/**
 * FeedbackRoute (Unit 9-5b, 4-F): the dedicated /settings/feedback page.
 * Matches proto.jsx FeedbackScreen. Submission logic is preserved from the
 * former inline FeedbackSection: multipart POST to /api/feedback, 10 MB cap,
 * success/error toasts. The optional email field is appended to the form
 * (server currently derives email from the session; wiring is a follow-up).
 */
export function FeedbackRoute() {
  const navigate = useNavigate();
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const overCap = totalBytes > MAX_TOTAL_BYTES;
  const canSubmit = message.trim().length > 0 && !overCap && !submitting;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };
  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("message", message.trim());
      if (category) body.set("category", CATEGORY_LABEL[category]);
      if (email.trim()) body.set("email", email.trim());
      for (const f of files) body.append("attachment", f);
      const res = await fetch("/api/feedback", {
        method: "POST",
        body,
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ icon: "check", text: "thanks — feedback sent", tone: "success" });
      navigate("/settings");
    } catch (err) {
      console.error("[feedback] submit failed:", err);
      toast({ icon: "alert", text: "couldn't send — try again", tone: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* PaneHeader: back + title (proto.jsx FeedbackScreen line 488) */}
      <header className="flex items-center gap-3 px-4 h-14 border-b border-hairline">
        <button
          data-testid="feedback-back"
          aria-label="back"
          onClick={() => navigate("/settings")}
          className="text-text-2 hover:text-text"
        >
          <Icon d="chev" className="text-text-2 rotate-180" size={18} />
        </button>
        <h1 className="text-base font-semibold text-text">give feedback</h1>
      </header>

      <div className="mx-auto w-full max-w-lg px-4 py-4 flex flex-col gap-4">
        <p className="text-sm text-text-2">
          found a bug or have an idea? tell me — it goes straight to the maker.
        </p>

        {/* your feedback */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
            your feedback
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="what's on your mind?"
            className="min-h-28 rounded-r-3 border border-hairline bg-panel text-text font-body text-sm p-3 resize-y outline-none focus:border-arcan-accent"
            data-testid="feedback-message"
          />
        </div>

        {/* category · optional */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
            category · optional
          </span>
          <div className="flex gap-2 flex-wrap" data-testid="feedback-category">
            {CATEGORIES.map((k) => {
              const on = category === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCategory(on ? null : k)}
                  data-testid={`feedback-category-${k}`}
                  className={`px-3 py-1.5 rounded-pill text-xs font-semibold border transition-colors ${
                    on
                      ? "bg-accent-soft text-arcan-accent border-accent-border"
                      : "bg-transparent text-text-2 border-hairline hover:bg-panel-2"
                  }`}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </div>

        {/* attachment · optional */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
            attachment · optional
          </span>
          {files.length === 0 ? (
            <label className="flex items-center justify-center gap-2 p-3 rounded-r-3 border border-dashed border-hairline cursor-pointer text-text-2 text-sm hover:bg-panel-2">
              <input
                type="file"
                multiple
                onChange={onFileChange}
                className="hidden"
                data-testid="feedback-file-input"
              />
              <Icon d="paperclip" className="text-text-2" size={15} />
              <span>add a screenshot (any type, ≤10 MB total)</span>
            </label>
          ) : (
            <div className="flex flex-col gap-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-r-3 border border-hairline bg-panel"
                >
                  <Icon d="image" className="text-arcan-accent" size={15} />
                  <span className="flex-1 text-sm text-text truncate" title={f.name}>
                    {f.name}
                  </span>
                  <span className="text-xs text-dim flex-shrink-0">
                    {Math.ceil(f.size / 1024)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-text-2 hover:text-red px-1"
                    aria-label="remove attachment"
                    data-testid={`feedback-file-remove-${i}`}
                  >
                    <Icon d="close" className="text-text-2" size={15} />
                  </button>
                </div>
              ))}
              <label className="text-xs text-arcan-accent cursor-pointer self-start">
                <input type="file" multiple onChange={onFileChange} className="hidden" />
                + add more
              </label>
              <div className="text-xs text-dim">
                total: {Math.ceil(totalBytes / 1024)} KB /{" "}
                {Math.ceil(MAX_TOTAL_BYTES / 1024 / 1024)} MB
                {overCap && <span className="text-red ml-2">over cap</span>}
              </div>
            </div>
          )}
        </div>

        {/* email · optional */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
            email · optional
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="for follow-up — leave blank to stay anonymous"
            data-testid="feedback-email"
            className="h-10 rounded-r-3 border border-hairline bg-panel text-text font-body text-sm px-3 outline-none focus:border-arcan-accent placeholder:text-dim"
          />
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          data-testid="feedback-submit"
          className="self-stretch inline-flex items-center justify-center gap-2 h-11 rounded-pill bg-arcan-accent text-on-accent font-semibold disabled:opacity-50"
        >
          <Icon d="send" className="text-on-accent" size={16} />
          {submitting ? "sending…" : "submit feedback"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the route in `index.tsx`**

In `src/routes/settings/index.tsx`, add the import and the child route inside `SettingsRoute`'s `<Routes>`:

Add the import (next to the other route imports):

```tsx
import { FeedbackRoute } from "./feedback-route";
```

Add the route (alongside `change-password` and `recovery-code`):

```tsx
        <Route path="feedback" element={<FeedbackRoute />} />
```

Resulting `SettingsRoute` `<Routes>`:

```tsx
    <Routes>
      <Route index element={<SettingsIndex />} />
      <Route path="change-password" element={<ChangePasswordRoute />} />
      <Route path="recovery-code" element={<RecoveryCodeRoute />} />
      <Route path="feedback" element={<FeedbackRoute />} />
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
```

- [ ] **Step 3: Typecheck**

Run:

```bash
nix-shell --run "npx tsc -b --noEmit"
```

Expected: no errors. (`bg-bg` must be a real token utility — confirm in `src/styles/tokens.css`; the prototype uses `c.bg`. If the project utility is named differently, e.g. `bg-base`, use that.)

- [ ] **Step 4: Token guard**

Run:

```bash
nix-shell --run "npm run check-tokens"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings/feedback-route.tsx src/routes/settings/index.tsx
git commit -m "feat(unit-9-5b): dedicated /settings/feedback route matching prototype"
```

### Task 4.4: E2E — feedback route navigation + submit

**Files:**
- Modify: `tests/e2e/settings-controls.spec.ts` (append)

- [ ] **Step 1: Append the test**

```ts
  test("feedback row opens the route, submits, and returns to settings", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      // Stub the feedback API so the test doesn't depend on Linear.
      await page.route("**/api/feedback", (route) =>
        route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) }),
      );
      await page.goto("/");
      await createAccount(page, "Eve");
      await page.goto("/settings");

      await page.getByTestId("feedback-row").click();
      await expect(page).toHaveURL(/\/settings\/feedback$/);
      await expect(page.getByTestId("feedback-submit")).toBeDisabled();

      await page.getByTestId("feedback-message").fill("the safety-number flow is slick");
      await page.getByTestId("feedback-category-idea").click();
      await expect(page.getByTestId("feedback-submit")).toBeEnabled();

      await page.getByTestId("feedback-submit").click();
      // Success toast + return to /settings.
      await expect(page).toHaveURL(/\/settings$/, { timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });
```

- [ ] **Step 2: Run to verify it passes**

Run:

```bash
nix-shell --run "npx playwright test tests/e2e/settings-controls.spec.ts -g 'feedback row'"
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/settings-controls.spec.ts
git commit -m "test(unit-9-5b): e2e for feedback route nav + submit"
```

---

## Phase 5 · Polish + verify

### Task 5b.1: `accentCheckColor` fallback (only if 9-5a did not export it)

**Files:**
- Modify: `src/routes/settings/appearance-section.tsx` (only if needed)

If Task 0.1 step 2 found no `accentCheckColor` export, define it locally and import from a local helper instead of the kit. Proto formula: `lum(col) > 0.55 ? "#0b0d14" : "#fff"`.

- [ ] **Step 1: Add the helper at the top of `appearance-section.tsx`** (replace the kit import of `accentCheckColor`)

```tsx
// Relative luminance (sRGB) — matches design/proto.jsx window.lum.
function lum(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function accentCheckColor(hex: string): string {
  return lum(hex) > 0.55 ? "#0b0d14" : "#fff";
}
```

Remove `accentCheckColor` from the `./settings-kit` import.

- [ ] **Step 2: Re-run the unit test + token guard**

Run:

```bash
nix-shell --run "npx vitest run tests/unit/appearance-accent-check.test.tsx && npm run check-tokens"
```

Expected: PASS. (Inline `#0b0d14` / `#fff` are passed as the `color` prop to `Icon`, not as Tailwind classes — check-tokens only scans class strings. If check-tokens flags them, route through a tiny inline `style` instead, which it allows for non-class color values; confirm against `scripts/check-tokens.sh`.)

- [ ] **Step 3: Commit (skip if 9-5a already provided the helper)**

```bash
git add src/routes/settings/appearance-section.tsx
git commit -m "ui(unit-9-5b): local accentCheckColor fallback"
```

### Task 5b.2: Full verification

**Files:** none

- [ ] **Step 1: Unit + token + typecheck**

Run:

```bash
nix-shell --run "npm run check-tokens && npx tsc -b --noEmit && npm run test"
```

Expected: all PASS.

- [ ] **Step 2: Settings e2e suite**

Run (requires the sync server; start it first if the helper doesn't):

```bash
nix-shell --run "npm run sync &" && sleep 3 && \
nix-shell --run "npx playwright test tests/e2e/settings-controls.spec.ts tests/e2e/notification-permission.spec.ts"
```

Expected: all PASS. (If `createAccount` helper already boots its own sync context, the explicit `npm run sync` is unnecessary — follow the pattern the existing e2e specs use.)

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run `nix-shell --run "npm run dev"` + sync, then:
- `/settings` → appearance card shows moon/sun + sparkle row icons; selected accent swatch has a contrast-correct check-mark; changing accent moves it.
- Notifications shows two sliders; flipping browser triggers the OS permission prompt; denying leaves it off.
- Devices card: device rows, then "link a device" as the LAST row → opens `/pair?role=initiator`.
- Feedback row sits directly below the account card, above appearance; clicking opens `/settings/feedback`; submitting returns to `/settings`.

- [ ] **Step 4: Commit any smoke fixes, then push**

```bash
git add -A
git commit -m "chore(unit-9-5b): post-verification fixes" --allow-empty
```

---

## Self-Review

**1. Spec coverage (§ 9-5, items 4-E / 4-F / 4-G / 4-H):**
- 4-E appearance — Phase 1: kept theme toggle + accent picker behavior (`apply()` unchanged), restyled into kit `Card`, added moon/sun + sparkle row icons, and the contrast-aware check-mark on the selected swatch. ✓
- 4-F feedback — Phase 4: collapsed the inline form to a single `FeedbackRow` ("give feedback" / "report a bug or share an idea" + chevron) positioned below account / above appearance (proto line 277); built `/settings/feedback` matching `FeedbackScreen` (header+back, textarea, bug/idea/question/note chips, dropzone, optional email, submit); preserved the `/api/feedback` multipart submission. ✓
- 4-G notifications — Phase 2: replaced checkbox/buttons with two `Toggle` sliders (sound + browser); browser slider flip triggers `Notification.requestPermission()`, denied → stays off, granted → on, mirrors `Notification.permission`; preserved the Slice 8 permission logic verbatim. ✓
- 4-H devices — Phase 3: restyled to kit `Card`; "link a device" row at the BOTTOM (proto line 309), navigates to `/pair?role=initiator`. ✓

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step shows full file contents or exact diffs. The only conditionals are explicit kit-API fallbacks (Chev, accentCheckColor, Card test-id passthrough) with concrete alternative code given. ✓

**3. Type consistency:** `AccentSwatches({ accent, onPick })`, `FeedbackRow()`, `FeedbackRoute()`, `CATEGORY_LABEL` (Bug/Idea/Question/Note) match across tasks and the api route. Test-ids are consistent: `accent-{k}` / `accent-check-{k}`, `sound-toggle` / `browser-toggle` / `browser-error`, `devices-card` / `device-row-{i}` / `link-device-row`, `feedback-row` / `feedback-message` / `feedback-category-{k}` / `feedback-submit` / `feedback-email`. Kit names (`Icon`, `Card`, `SectionLabel`, `SRow`, `Toggle`, `Chev`, `accentCheckColor`) match the declared 9-5a interface. ✓

**4. Dependency on 9-5a:** declared explicitly with a full interface contract + Task 0.1 confirmation gate + per-component fallbacks where the kit API may differ. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-23-unit-9-5b-settings-controls-feedback.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
