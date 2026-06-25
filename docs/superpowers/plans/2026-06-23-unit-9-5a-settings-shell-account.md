# Unit 9-5a — Settings Shell + Account/Security Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the settings landing page against the prototype: a shared settings kit (`Card`, `SectionLabel`, `SRow`, `Toggle`, `Chev`, `Icon`), the account section as the first card (MeRow → profile, change-password, recovery-code, expandable safety number), a danger-red sign-out card at the bottom, and consistent destructive styling on the change-password + recovery-code routes.

**Architecture:** A new `src/routes/settings/settings-kit.tsx` module exports the reusable presentational primitives (token-driven, no Jazz/router coupling). `account-section.tsx` is rewritten to render a `Card` of `SRow`s + `MeRow`. A new `SettingsBody` scaffold in `index.tsx` lists sections in prototype order (account → feedback → appearance → notifications → devices → sign-out) with explicit insertion points so 9-5b can drop in the middle sections without touching the account/sign-out code 9-5a owns. 9-5a builds: the kit, the account section, the sign-out card, the page scaffold, and restyles the two security routes. 9-5b fills appearance/notifications/devices and the feedback row→route.

**Tech Stack:** React 18, TypeScript (strict), Tailwind v3 (token utilities only), react-router-dom, Vitest + @testing-library/react, jazz-tools 0.20.18.

---

## Spec → this plan

Covers spec `docs/superpowers/specs/2026-06-23-unit-9-feedback-log.md` §4 (the shell + account half) and §5-A:

- **4-B** (card sectioning + fix inverted colors) → Tasks 1–2 (kit) + Task 6 (scaffold).
- **4-C** (leading row icons) → Task 1 (`Icon`) consumed by Tasks 2–5.
- **4-D** (account section first: MeRow → profile, change password, recovery code, **expandable** safety number) → Tasks 3–4.
- **4-I** (sign-out = its own danger-red card at the bottom) → Task 5.
- **5-A** (consistent destructive/red styling + subtle onboarding-tone helper text on the change-password + recovery-code routes) → Tasks 7–8.

**Out of scope (9-5b owns):** 4-E appearance check-mark, 4-F feedback row→route, 4-G notification toggle behaviour, 4-H devices restyle. This plan defines `Toggle` in the kit (shared) but does not wire it. The scaffold (Task 6) renders the appearance/notifications/devices/feedback slots as clearly-marked placeholders that 9-5b replaces.

**Canonical design references (read before coding):**
- `design/proto.jsx` `SettingsScreen` (line 261) — section order + MeRow + sign-out danger.
- `design/hf-settings.jsx` lines 6–134 — `SectionLabel`, `Card`, `SRow`, `Toggle`, `Chev`, `MeRow`, `SettingsBody`.
- `design/hf-kit.jsx` lines 115–146 — `IPATHS` icon path map + `Icon` component.

**Prototype values to reproduce exactly:**
| Element | Value | Token / class |
|---|---|---|
| Card radius | `radius + 2` = 14px | `rounded-r-5` |
| Card bg / border | `panel` / hairline | `bg-panel border border-hairline` |
| Row divider | 1px hairline, none on last | `border-b border-hairline` (omit on last) |
| `SRow` padding | `12px 14px` | `px-3.5 py-3` (14px / 12px) |
| `MeRow` padding | `13px 14px` | `px-3.5 py-[13px]` |
| Row icon size | 17px | `<Icon size={17} />` |
| Row label | `500 12.5px/1.2` | `text-[12.5px] font-medium leading-tight` |
| Row sub | `400 10.5px/1.2 dim` | `text-[10.5px] text-dim leading-tight` |
| Row value | `400 11px dim` | `text-[11px] text-dim` |
| Chevron | `chev`, 15px, dim | `<Icon d="chev" size={15} className="text-dim" />` |
| `SectionLabel` | `600 9px`, `.16em` tracking, uppercase, dim, padding `2px 4px 8px` | see Task 2 |
| MeRow avatar | 44px | `Avatar size="md"` is 40px → pass `className="!w-11 !h-11"` (44px) |
| Toggle | 36×21 pill, 15px knob, knob `left:2`→`left:17` | see Task 1 |
| Sign-out | `danger` → red text + red icon | `text-red`, `<Icon ... className="text-red" />` |
| Body container | `padding:16px`, `gap:16px`, `maxWidth:560`, centered | `max-w-[560px] mx-auto p-4 flex flex-col gap-4` |

---

## File structure

- **Create** `src/routes/settings/settings-kit.tsx` — presentational primitives: `Icon`, `Card`, `SectionLabel`, `SRow`, `Chev`, `Toggle`. Pure, token-driven, no Jazz/router imports. Reused by 9-5b.
- **Create** `tests/unit/routes/settings/settings-kit.test.tsx` — kit primitive tests.
- **Rewrite** `src/routes/settings/account-section.tsx` — `MeRow` + change-password/recovery-code rows + expandable safety-number row, inside a `Card`. Drops the sign-out button (moves to scaffold).
- **Create** `src/routes/settings/sign-out-card.tsx` — danger-red sign-out `Card` (own component so the scaffold stays declarative and the sign-out logic is testable in isolation).
- **Rewrite** `tests/unit/routes/settings/section-titles.test.tsx` won't change much, but **create** `tests/unit/routes/settings/account-section.test.tsx` and `tests/unit/routes/settings/sign-out-card.test.tsx`.
- **Modify** `src/routes/settings/index.tsx` — replace `SettingsIndex` body with a `SettingsBody` scaffold in prototype order, account + sign-out wired, middle sections as 9-5b placeholders.
- **Restyle** `src/routes/settings/change-password-route.tsx` + `src/routes/settings/recovery-code-route.tsx` — destructive-consistent styling + subtle helper text.

---

## Environment notes (every test/command runs inside nix-shell)

All test commands below assume you have entered the repo's nix shell:

```bash
nix-shell --run '<command>'
```

Run the token guard after any UI change:

```bash
nix-shell --run 'npm run check-tokens'
```

The guard rejects raw `bg-white`, `text-gray-*`, `border-gray-*`, etc. Use only the token utilities listed in the table above.

---

### Task 1: Settings kit — `Icon`, `Toggle`, `Chev`

**Files:**
- Create: `src/routes/settings/settings-kit.tsx`
- Test: `tests/unit/routes/settings/settings-kit.test.tsx`

The project has **no icon library** (verified: no lucide/heroicons in `package.json`); icons are inline SVGs with `stroke="currentColor"` (see `src/components/modal-shell.tsx:182`). The kit ships a small `Icon` matching the design's `IPATHS` map (`design/hf-kit.jsx:115-146`) but using `currentColor` so colour comes from a Tailwind `text-*` class on the SVG, keeping it token-compliant.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/routes/settings/settings-kit.test.tsx
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Icon, Chev, Toggle } from "@/routes/settings/settings-kit";

describe("settings-kit Icon", () => {
  test("renders an svg with the named path and size", () => {
    const { container } = render(<Icon d="key" size={17} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("width")).toBe("17");
    expect(svg.getAttribute("height")).toBe("17");
    // currentColor so a text-* class drives the colour (token-compliant)
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    const path = svg.querySelector("path")!;
    expect(path.getAttribute("d")).toContain("M19 11H5"); // key glyph
  });

  test("passes className through to the svg", () => {
    const { container } = render(<Icon d="shield" className="text-red" />);
    expect(container.querySelector("svg")!.getAttribute("class")).toContain(
      "text-red",
    );
  });
});

describe("settings-kit Chev", () => {
  test("renders a dim 15px chevron", () => {
    const { container } = render(<Chev />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("15");
    expect(svg.getAttribute("class")).toContain("text-dim");
  });
});

describe("settings-kit Toggle", () => {
  test("on=true exposes aria-checked and switch role", () => {
    render(<Toggle on={true} aria-label="t" />);
    const sw = screen.getByRole("switch", { name: "t" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  test("on=false renders aria-checked=false", () => {
    render(<Toggle on={false} aria-label="t" />);
    expect(screen.getByRole("switch", { name: "t" }).getAttribute("aria-checked")).toBe("false");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/settings-kit.test.tsx'`
Expected: FAIL — `Cannot find module '@/routes/settings/settings-kit'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/routes/settings/settings-kit.tsx
import type { ReactNode } from "react";

/**
 * Settings kit — presentational primitives shared by 9-5a (account, sign-out)
 * and 9-5b (appearance, notifications, devices, feedback). Pure + token-driven;
 * no Jazz or router imports so they're trivially testable and reusable.
 *
 * Mirrors design/hf-settings.jsx (Card/SectionLabel/SRow/Toggle/Chev) and the
 * design/hf-kit.jsx IPATHS icon map. Icons stroke with currentColor so colour
 * comes from a Tailwind text-* class (token-compliant — no inline colour).
 */

// ---- Icon ----
// Path data copied verbatim from design/hf-kit.jsx:115-142. Only the glyphs
// the settings surface uses are included.
const IPATHS: Record<string, string> = {
  key: "M19 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2zM8 11V7a4 4 0 0 1 8 0v4",
  shield: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z",
  message:
    "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  at: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1",
  device:
    "M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2",
  plus: "M12 5v14M5 12h14",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  sparkle: "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z",
  chev: "M9 6l6 6-6 6",
  check: "M20 6L9 17l-5-5",
};

export type IconName = keyof typeof IPATHS;

export function Icon({
  d,
  size = 18,
  sw = 1.6,
  className,
}: {
  d: IconName;
  size?: number;
  sw?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={IPATHS[d]} />
    </svg>
  );
}

// ---- Chev (trailing chevron, dim, 15px) ----
export function Chev() {
  return <Icon d="chev" size={15} className="text-dim flex-shrink-0" />;
}

// ---- Toggle (36×21 pill, 15px knob; design/hf-settings.jsx:28-35) ----
// Presentational only — caller owns state + onClick. Knob slides 2→17px.
export function Toggle({
  on,
  onClick,
  "aria-label": ariaLabel,
}: {
  on: boolean;
  onClick?: () => void;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`relative h-[21px] w-9 flex-shrink-0 rounded-pill border transition-colors ${
        on
          ? "bg-arcan-accent border-transparent"
          : "bg-panel-2 border-hairline"
      }`}
    >
      <span
        className={`absolute top-0.5 h-[15px] w-[15px] rounded-pill transition-[left] ${
          on ? "left-[17px] bg-on-accent" : "left-0.5 bg-text-2"
        }`}
      />
    </button>
  );
}

export type { ReactNode };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/settings-kit.test.tsx'`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings/settings-kit.tsx tests/unit/routes/settings/settings-kit.test.tsx
git commit -m "feat(unit-9-5a): settings-kit Icon/Chev/Toggle primitives"
```

---

### Task 2: Settings kit — `Card`, `SectionLabel`, `SRow`

**Files:**
- Modify: `src/routes/settings/settings-kit.tsx`
- Test: `tests/unit/routes/settings/settings-kit.test.tsx`

This is the **4-B** fix: connected container (`panel` bg + hairline border + hairline-divided rows + 14px radius) with the section label **above** the card. The previous live UI had the bg/category colours inverted; the `Card` here pins `bg-panel` and `border-hairline`.

- [ ] **Step 1: Write the failing test (append to the kit test file)**

```tsx
// append to tests/unit/routes/settings/settings-kit.test.tsx
import { Card, SectionLabel, SRow } from "@/routes/settings/settings-kit";

describe("settings-kit Card", () => {
  test("renders panel bg + hairline border + 14px radius", () => {
    const { container } = render(<Card>x</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("bg-panel");
    expect(div.className).toContain("border-hairline");
    expect(div.className).toContain("rounded-r-5");
  });
});

describe("settings-kit SectionLabel", () => {
  test("renders an uppercase tracked label", () => {
    render(<SectionLabel>account</SectionLabel>);
    const el = screen.getByText("account");
    expect(el.className).toContain("uppercase");
    expect(el.className).toContain("text-dim");
  });
});

describe("settings-kit SRow", () => {
  test("renders leading icon, label, sub, value", () => {
    const { container } = render(
      <SRow icon="key" label="change password" sub="hi" value="now" />,
    );
    expect(screen.getByText("change password")).toBeTruthy();
    expect(screen.getByText("hi")).toBeTruthy();
    expect(screen.getByText("now")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy(); // leading icon
  });

  test("danger renders label + icon in red", () => {
    const { container } = render(<SRow icon="logout" label="sign out" danger last />);
    const label = screen.getByText("sign out");
    expect(label.className).toContain("text-red");
    // leading icon wrapper carries the red text colour
    const iconWrap = container.querySelector("[data-icon-wrap]")!;
    expect(iconWrap.className).toContain("text-red");
  });

  test("last=true omits the bottom divider", () => {
    const { container } = render(<SRow label="x" last />);
    expect((container.firstChild as HTMLElement).className).not.toContain("border-b");
  });

  test("non-last renders the bottom divider", () => {
    const { container } = render(<SRow label="x" />);
    expect((container.firstChild as HTMLElement).className).toContain("border-b");
  });

  test("clickable row renders as a button when onClick is given", () => {
    render(<SRow label="go" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: /go/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/settings-kit.test.tsx'`
Expected: FAIL — `Card`/`SectionLabel`/`SRow` not exported.

- [ ] **Step 3: Add the implementation (append to `settings-kit.tsx`)**

```tsx
// ---- Card (connected container; design/hf-settings.jsx:10-13) ----
export function Card({
  children,
  "data-testid": testId,
}: {
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="overflow-hidden rounded-r-5 border border-hairline bg-panel"
    >
      {children}
    </div>
  );
}

// ---- SectionLabel (uppercase tracked label ABOVE a card) ----
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-1 pb-2 pt-0.5">
      <span className="text-[9px] font-semibold uppercase leading-none tracking-[0.16em] text-dim">
        {children}
      </span>
    </div>
  );
}

// ---- SRow (icon + label + optional sub + optional value/control; chevron) ----
export function SRow({
  icon,
  label,
  sub,
  value,
  control,
  danger,
  last,
  onClick,
  "data-testid": testId,
}: {
  icon?: IconName;
  label: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  control?: ReactNode;
  danger?: boolean;
  last?: boolean;
  onClick?: () => void;
  "data-testid"?: string;
}) {
  const border = last ? "" : "border-b border-hairline";
  const inner = (
    <>
      {icon && (
        <span
          data-icon-wrap
          className={danger ? "text-red" : "text-text-2"}
        >
          <Icon d={icon} size={17} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div
          className={`text-[12.5px] font-medium leading-tight ${
            danger ? "text-red" : "text-text"
          }`}
        >
          {label}
        </div>
        {sub && (
          <div className="mt-0.5 text-[10.5px] leading-tight text-dim">{sub}</div>
        )}
      </div>
      {value && <span className="text-[11px] text-dim">{value}</span>}
      {control}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-panel-2 ${border}`}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      data-testid={testId}
      className={`flex items-center gap-3 px-3.5 py-3 ${border}`}
    >
      {inner}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/settings-kit.test.tsx'`
Expected: PASS (all kit tests).

- [ ] **Step 5: Run the token guard**

Run: `nix-shell --run 'npm run check-tokens'`
Expected: `✓ no ad-hoc Tailwind color/typography classes detected`

- [ ] **Step 6: Commit**

```bash
git add src/routes/settings/settings-kit.tsx tests/unit/routes/settings/settings-kit.test.tsx
git commit -m "feat(unit-9-5a): settings-kit Card/SectionLabel/SRow"
```

---

### Task 3: Account section — `MeRow` + change-password/recovery-code rows

**Files:**
- Rewrite: `src/routes/settings/account-section.tsx`
- Test: Create `tests/unit/routes/settings/account-section.test.tsx`

This is **4-D** minus the expandable safety number (Task 4) and minus sign-out (moved to Task 5). The `AccountSection` becomes a `Card` whose first row is `MeRow` (avatar + name + "view your profile" → `/profile/<me-id>`), then `change password` → `/settings/change-password`, then `recovery code` → `/settings/recovery-code`. The safety-number row (last) is added in Task 4.

MeRow avatar is 44px in the design; the `Avatar` primitive's `md` is 40px, so override with `className="!w-11 !h-11"` (44px).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/routes/settings/account-section.test.tsx
import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AccountSection } from "@/routes/settings/account-section";

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "decima", avatar: null },
    $jazz: { id: "me-account-id" },
  }),
}));

vi.mock("@/auth/pubkey", () => ({
  getAccountPubkeyHex: () => "deadbeef".repeat(8),
}));

vi.mock("@/components/safety-number", () => ({
  SafetyNumber: () => <div data-testid="safety-number-stub" />,
}));

function renderSection() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<AccountSection />} />
        <Route path="/profile/:id" element={<div data-testid="profile-page" />} />
        <Route
          path="/settings/change-password"
          element={<div data-testid="cp-page" />}
        />
        <Route
          path="/settings/recovery-code"
          element={<div data-testid="rc-page" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AccountSection", () => {
  test("MeRow shows the display name + 'view your profile' and links to the profile", () => {
    renderSection();
    expect(screen.getByText("decima")).toBeTruthy();
    expect(screen.getByText("view your profile")).toBeTruthy();
    fireEvent.click(screen.getByTestId("settings-me-row"));
    expect(screen.getByTestId("profile-page")).toBeTruthy();
  });

  test("change-password row navigates to /settings/change-password", () => {
    renderSection();
    fireEvent.click(screen.getByTestId("change-password-btn"));
    expect(screen.getByTestId("cp-page")).toBeTruthy();
  });

  test("recovery-code row navigates to /settings/recovery-code", () => {
    renderSection();
    fireEvent.click(screen.getByTestId("view-recovery-code-btn"));
    expect(screen.getByTestId("rc-page")).toBeTruthy();
  });

  test("section label reads 'account'", () => {
    renderSection();
    expect(screen.getByText("account")).toBeTruthy();
  });
});
```

> Note: the `data-testid`s `change-password-btn` and `view-recovery-code-btn` are kept identical to the old section so existing e2e selectors keep working.

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/account-section.test.tsx'`
Expected: FAIL — `settings-me-row` not found (old section renders Buttons, not the new rows).

- [ ] **Step 3: Rewrite `account-section.tsx`**

```tsx
import { useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Avatar } from "@/components/avatar";
import { Card, SectionLabel, SRow, Chev } from "./settings-kit";
import { Skel } from "@/components/skeleton";

/**
 * AccountSection (Unit 9-5a): the FIRST card in settings, rebuilt against the
 * prototype (design/proto.jsx:270 + design/hf-settings.jsx:95-100).
 *
 * Rows: MeRow (avatar + name + "view your profile" → /profile/<me-id>),
 * change password → /settings/change-password, recovery code →
 * /settings/recovery-code, then an expandable safety-number row (Task 4).
 *
 * Sign-out moved out to its own danger-red card at the bottom (SignOutCard).
 */
export function AccountSection() {
  const me = useAccount(ArcanAccount, { resolve: {} });
  const navigate = useNavigate();

  if (!me.$isLoaded) {
    return (
      <div data-testid="account-section-loading">
        <SectionLabel>account</SectionLabel>
        <Card>
          <div className="px-3.5 py-3">
            <Skel w="55%" h={14} />
          </div>
        </Card>
      </div>
    );
  }

  const myID = (me as any).$jazz?.id as string | undefined;

  return (
    <div>
      <SectionLabel>account</SectionLabel>
      <Card>
        {/* MeRow — whole row → profile (design MeRow, 44px avatar) */}
        <button
          type="button"
          data-testid="settings-me-row"
          onClick={() => myID && navigate(`/profile/${myID}`)}
          disabled={!myID}
          className="flex w-full items-center gap-3 border-b border-hairline px-3.5 py-[13px] text-left hover:bg-panel-2 disabled:opacity-50"
        >
          <Avatar
            src={(me as any).profile.avatar}
            initials={me.profile.displayName?.[0] ?? "?"}
            size="md"
            loadAs={me}
            className="!h-11 !w-11"
            data-testid="settings-me-avatar"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold leading-tight text-text">
              {me.profile.displayName}
            </div>
            <div className="mt-0.5 text-[11px] leading-none text-dim">
              view your profile
            </div>
          </div>
          <Chev />
        </button>

        <SRow
          icon="key"
          label="change password"
          control={<Chev />}
          onClick={() => navigate("/settings/change-password")}
          data-testid="change-password-btn"
        />
        <SRow
          icon="shield"
          label="recovery code"
          control={<Chev />}
          onClick={() => navigate("/settings/recovery-code")}
          data-testid="view-recovery-code-btn"
          last
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/account-section.test.tsx'`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings/account-section.tsx tests/unit/routes/settings/account-section.test.tsx
git commit -m "feat(unit-9-5a): account section MeRow + password/recovery rows"
```

---

### Task 4: Account section — expandable safety-number row

**Files:**
- Modify: `src/routes/settings/account-section.tsx`
- Modify: `tests/unit/routes/settings/account-section.test.tsx`

**4-D** final piece: the safety number becomes an **expandable/dropdown row** appended as the last row of the account card. Collapsed: an `SRow` (`shield`-ish — use `shield` since `key` is already taken by change-password; the prototype gives it no dedicated icon, so reuse `shield` is acceptable and matches the security grouping) labelled "safety number" with a chevron that rotates when open. Expanded: the existing `<SafetyNumber>` renders below, inside the card, on `bg-panel-2`.

The change-password row's `last` flag moves off (it is now followed by recovery-code which is followed by safety-number), and recovery-code's `last` is removed; the safety-number block becomes the visual last element.

- [ ] **Step 1: Add the failing test (append to `account-section.test.tsx`)**

```tsx
test("safety-number row is collapsed by default and expands on click", () => {
  renderSection();
  // collapsed: the SafetyNumber stub is not in the document
  expect(screen.queryByTestId("safety-number-stub")).toBeNull();
  fireEvent.click(screen.getByTestId("safety-number-toggle"));
  expect(screen.getByTestId("safety-number-stub")).toBeTruthy();
  // toggling again collapses
  fireEvent.click(screen.getByTestId("safety-number-toggle"));
  expect(screen.queryByTestId("safety-number-stub")).toBeNull();
});

test("safety-number toggle exposes aria-expanded", () => {
  renderSection();
  const btn = screen.getByTestId("safety-number-toggle");
  expect(btn.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(btn);
  expect(btn.getAttribute("aria-expanded")).toBe("true");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/account-section.test.tsx'`
Expected: FAIL — `safety-number-toggle` not found.

- [ ] **Step 3: Wire the expandable row into `account-section.tsx`**

Add the imports at the top:

```tsx
import { useState } from "react";
import { SafetyNumber } from "@/components/safety-number";
import { getAccountPubkeyHex } from "@/auth/pubkey";
```

Add a state hook inside the component (after `const navigate = ...`):

```tsx
  const [showSafety, setShowSafety] = useState(false);
```

Compute the fingerprint after the `myID` line (inside the loaded branch):

```tsx
  const fingerprintHex = getAccountPubkeyHex(me);
```

Replace the recovery-code `SRow` (remove its `last`) and append the expandable block as the new last element of the `Card`:

```tsx
        <SRow
          icon="shield"
          label="recovery code"
          control={<Chev />}
          onClick={() => navigate("/settings/recovery-code")}
          data-testid="view-recovery-code-btn"
        />

        {/* Expandable safety-number row (4-D). Collapsed shows a chevron that
            rotates open; expanded renders the formatted number on panel-2. */}
        <button
          type="button"
          data-testid="safety-number-toggle"
          aria-expanded={showSafety}
          onClick={() => setShowSafety((v) => !v)}
          className={`flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-panel-2 ${
            showSafety ? "border-b border-hairline" : ""
          }`}
        >
          <span className="text-text-2">
            <Icon d="shield" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-medium leading-tight text-text">
              safety number
            </div>
            <div className="mt-0.5 text-[10.5px] leading-tight text-dim">
              verify it matches in person
            </div>
          </div>
          <span
            className={`text-dim transition-transform ${showSafety ? "rotate-90" : ""}`}
          >
            <Icon d="chev" size={15} />
          </span>
        </button>
        {showSafety && (
          <div className="bg-panel-2 px-3.5 py-3">
            <SafetyNumber fingerprintHex={fingerprintHex} />
          </div>
        )}
```

Add the `Icon` import to the kit import line:

```tsx
import { Card, SectionLabel, SRow, Chev, Icon } from "./settings-kit";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/account-section.test.tsx'`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the token guard**

Run: `nix-shell --run 'npm run check-tokens'`
Expected: `✓ no ad-hoc Tailwind color/typography classes detected`

- [ ] **Step 6: Commit**

```bash
git add src/routes/settings/account-section.tsx tests/unit/routes/settings/account-section.test.tsx
git commit -m "feat(unit-9-5a): expandable safety-number row in account section"
```

---

### Task 5: Sign-out card (danger-red, bottom)

**Files:**
- Create: `src/routes/settings/sign-out-card.tsx`
- Test: Create `tests/unit/routes/settings/sign-out-card.test.tsx`

**4-I**: sign-out is its own `Card` at the very bottom, red. The sign-out logic is lifted verbatim from the old `account-section.tsx` (authClient.signOut() then logOut(); confirm() guard). Keep `data-testid="sign-out-btn"` for e2e compat.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/routes/settings/sign-out-card.test.tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignOutCard } from "@/routes/settings/sign-out-card";

const logOut = vi.fn();
const signOut = vi.fn(async () => undefined);

vi.mock("jazz-tools/react", () => ({
  useLogOut: () => logOut,
}));
vi.mock("@/auth/client", () => ({
  authClient: { signOut: () => signOut() },
}));

describe("SignOutCard", () => {
  beforeEach(() => {
    logOut.mockClear();
    signOut.mockClear();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  test("renders a red sign-out row with a logout icon", () => {
    const { container } = render(<SignOutCard />);
    const label = screen.getByText("sign out");
    expect(label.className).toContain("text-red");
    expect(container.querySelector("svg")).toBeTruthy();
  });

  test("clicking confirms, calls authClient.signOut() then logOut()", async () => {
    render(<SignOutCard />);
    fireEvent.click(screen.getByTestId("sign-out-btn"));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(logOut).toHaveBeenCalled());
  });

  test("cancelling the confirm dialog does not sign out", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<SignOutCard />);
    fireEvent.click(screen.getByTestId("sign-out-btn"));
    expect(logOut).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/sign-out-card.test.tsx'`
Expected: FAIL — `Cannot find module '@/routes/settings/sign-out-card'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/routes/settings/sign-out-card.tsx
import { useLogOut } from "jazz-tools/react";
import { authClient } from "@/auth/client";
import { Card, SRow, Icon } from "./settings-kit";

/**
 * SignOutCard (Unit 9-5a): standalone danger-red card at the bottom of
 * settings. Sign-out logic lifted from the old AccountSection — calls
 * authClient.signOut() to invalidate the Better Auth cookie server-side,
 * then logOut() to clear local Jazz creds. Network failure on signOut()
 * must not block the local logOut().
 */
export function SignOutCard() {
  const logOut = useLogOut();

  async function handleSignOut() {
    if (
      !confirm(
        "Sign out? You'll need your password to sign back in. Local data will be cleared.",
      )
    )
      return;
    try {
      await authClient.signOut();
    } catch {
      // Network failure shouldn't block local logOut; the Better Auth
      // session will expire naturally.
    }
    logOut();
  }

  return (
    <Card>
      <SRow
        icon="logout"
        label="sign out"
        danger
        last
        onClick={() => void handleSignOut()}
        data-testid="sign-out-btn"
      />
    </Card>
  );
}
```

> The `Icon` import is unused in this file (the `SRow danger` path renders its own icon). Drop the `Icon` from the import to avoid a lint error — import only `{ Card, SRow }`.

Correct import line:

```tsx
import { Card, SRow } from "./settings-kit";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/sign-out-card.test.tsx'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings/sign-out-card.tsx tests/unit/routes/settings/sign-out-card.test.tsx
git commit -m "feat(unit-9-5a): danger-red sign-out card"
```

---

### Task 6: Settings page scaffold (`SettingsBody`, prototype order)

**Files:**
- Modify: `src/routes/settings/index.tsx`
- Test: Create `tests/unit/routes/settings/settings-index.test.tsx`

**Section order (prototype):** account → feedback → appearance → notifications → devices → sign-out. 9-5a wires **account** (Task 3-4) and **sign-out** (Task 5). The middle four are 9-5b's; render them here as the *current* section components wrapped in a clearly-marked placeholder region so the page is functional now and 9-5b has obvious insertion points.

**Coordination note (state in the plan + in code comments):** 9-5a owns `SettingsBody`, the account card, and the sign-out card. The block between the account `<div>` and the `<SignOutCard />` is the **9-5b insertion zone** — bounded by `{/* === 9-5b INSERTION ZONE START === */}` / `END` comments. 9-5b replaces the placeholder children (the existing `FeedbackSection`/`AppearanceSection`/`NotificationsSection`/`DevicesSection`) with prototype-matched cards and the feedback row→route, without editing the account or sign-out code. The body container layout (`max-w-[560px] mx-auto p-4 flex flex-col gap-4`) is owned here and shared.

The desktop sidebar persists via AppShell (the settings page renders inside the shell outlet) — no header/back chrome is added here on desktop; the existing back `<Link>` is dropped because the persistent sidebar provides navigation (matches 2-F / 4-A).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/routes/settings/settings-index.test.tsx
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { ThemeProvider } from "@/styles/use-theme";
import { AccentProvider } from "@/styles/use-accent";
import { SettingsRoute } from "@/routes/settings";

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "decima", avatar: null },
    root: {
      devices: [],
      invitesIssued: [],
      settings: {
        appearance: { theme: "dark", accent: "tokyo", $jazz: { set: vi.fn() } },
        notifications: { sound: false, browser: false, $jazz: { set: vi.fn() } },
      },
    },
    $jazz: { id: "me-account-id" },
  }),
  useLogOut: () => vi.fn(),
}));
vi.mock("@/auth/pubkey", () => ({ getAccountPubkeyHex: () => "deadbeef".repeat(8) }));
vi.mock("@/auth/session", () => ({ getCurrentSessionFingerprint: () => null }));
vi.mock("@/components/safety-number", () => ({ SafetyNumber: () => <div /> }));

function renderIndex() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <ToastProvider>
        <ThemeProvider>
          <AccentProvider>
            <SettingsRoute />
          </AccentProvider>
        </ThemeProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("settings index scaffold", () => {
  test("renders the account section first and the sign-out card", () => {
    renderIndex();
    expect(screen.getByTestId("settings-me-row")).toBeTruthy();
    expect(screen.getByTestId("sign-out-btn")).toBeTruthy();
  });

  test("account section renders before sign-out in document order", () => {
    renderIndex();
    const me = screen.getByTestId("settings-me-row");
    const out = screen.getByTestId("sign-out-btn");
    // bitmask 4 = DOCUMENT_POSITION_FOLLOWING: out follows me
    expect(me.compareDocumentPosition(out) & 4).toBeTruthy();
  });

  test("exposes the 9-5b insertion zone marker", () => {
    renderIndex();
    expect(screen.getByTestId("settings-9-5b-zone")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/settings-index.test.tsx'`
Expected: FAIL — `settings-9-5b-zone` not found (old `SettingsIndex` renders the old layout).

- [ ] **Step 3: Rewrite the `SettingsIndex` body in `index.tsx`**

Replace the existing `SettingsIndex` function (keep `SettingsRoute` and all imports, and add the new ones) with:

```tsx
function SettingsBody() {
  return (
    <div className="min-h-screen bg-bg" data-testid="settings-body">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 p-4">
        {/* account — owned by 9-5a */}
        <AccountSection />

        {/* === 9-5b INSERTION ZONE START ===
            9-5b replaces these placeholder sections (feedback → appearance →
            notifications → devices), in this order, with prototype-matched
            cards (feedback collapses to a single row → /settings/feedback).
            Do NOT touch AccountSection or SignOutCard. */}
        <div data-testid="settings-9-5b-zone" className="flex flex-col gap-4">
          <FeedbackSection />
          <AppearanceSection />
          <NotificationsSection />
          <DevicesSection />
        </div>
        {/* === 9-5b INSERTION ZONE END === */}

        {/* sign-out — owned by 9-5a, always last */}
        <SignOutCard />
      </div>
    </div>
  );
}
```

Update the import block at the top of `index.tsx`:

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { AccountSection } from "./account-section";
import { SignOutCard } from "./sign-out-card";
import { AppearanceSection } from "./appearance-section";
import { NotificationsSection } from "./notifications-section";
import { FeedbackSection } from "./feedback-section";
import { DevicesSection } from "./devices-section";
import { ChangePasswordRoute } from "./change-password-route";
import { RecoveryCodeRoute } from "./recovery-code-route";
```

> Removed imports: `Link` (no longer used — persistent sidebar replaces the back link), `ProfileSection` (the MeRow in AccountSection subsumes it), `InvitesSection` (invites are not part of the prototype settings surface; if it must stay, 9-5b decides — leave it out of the scaffold for now per prototype). Keep the `SettingsIndex` export name by renaming `SettingsBody`'s use site: the `<Route index>` element becomes `<SettingsBody />`.

Update the dispatcher's index route element:

```tsx
    <Routes>
      <Route index element={<SettingsBody />} />
      <Route path="change-password" element={<ChangePasswordRoute />} />
      <Route path="recovery-code" element={<RecoveryCodeRoute />} />
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/settings-index.test.tsx'`
Expected: PASS (3 tests).

- [ ] **Step 5: Update `section-titles.test.tsx` for the dropped imports**

The existing `tests/unit/routes/settings/section-titles.test.tsx` imports `ProfileSection`, `AccountSection`, `InvitesSection` and asserts their `<h2>` labels. AccountSection no longer renders an `<h2>` (it uses `SectionLabel`, a `<span>`), and ProfileSection is no longer used. Remove the `ProfileSection`, `AccountSection`, and `InvitesSection` rows from the `test.each` table so it only covers the sections that still render an `<h2>` (those are 9-5b's; this test will be revisited there). Edit:

```tsx
  test.each([
    [AppearanceSection, "appearance"],
    [NotificationsSection, "notifications"],
    [DevicesSection, "devices"],
    [FeedbackSection, "give feedback"],
  ])("renders a lowercase h2 with the expected label", (Section, label) => {
```

and remove the now-unused imports (`ProfileSection`, `AccountSection`, `InvitesSection`) and the `@/auth/pubkey` / `@/auth/session` / `safety-number` mocks if no longer referenced.

- [ ] **Step 6: Run the full settings test suite + token guard**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings && npm run check-tokens'`
Expected: all settings tests PASS; token guard `✓`.

- [ ] **Step 7: Commit**

```bash
git add src/routes/settings/index.tsx tests/unit/routes/settings/settings-index.test.tsx tests/unit/routes/settings/section-titles.test.tsx
git commit -m "feat(unit-9-5a): settings scaffold in prototype order with 9-5b zone"
```

---

### Task 7: Restyle the change-password route (destructive + helper text)

**Files:**
- Modify: `src/routes/settings/change-password-route.tsx`
- Test: Modify `tests/unit/routes/settings/change-password-route.test.tsx`

**5-A**: consistent destructive/red styling + subtle onboarding-tone helper text. Changing your password revokes other sessions (the server revokes them on success), so the action is destructive — give the submit button a red treatment and add one line of understated helper text above the form. The existing error paragraph's `rounded-r-3` becomes `rounded-r-4` to match the soft radius scale (DEC-1). The `<Link>` back is kept (the sub-route is reached from the account card; the persistent sidebar is also present, but the back link is the in-pane affordance here).

- [ ] **Step 1: Add a failing test (append to `change-password-route.test.tsx`)**

```tsx
test("renders subtle helper text explaining other sessions are signed out", () => {
  renderRoute();
  expect(
    screen.getByText(/sign you out on your other devices/i),
  ).toBeTruthy();
});

test("submit button carries the destructive red treatment", () => {
  renderRoute();
  const btn = screen.getByTestId("change-password-submit");
  expect(btn.className).toContain("text-red");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/change-password-route.test.tsx'`
Expected: FAIL — helper text not present; submit button has no `text-red`.

- [ ] **Step 3: Apply the restyle**

Add the helper line directly under the `<h1>`:

```tsx
        <h1 className="text-xl font-bold text-text mb-1">change password</h1>
        <p className="mb-6 text-[11.5px] leading-relaxed text-text-2">
          changing your password re-encrypts your account and will sign you out
          on your other devices.
        </p>
```

(Removed the old `mb-6` on the `<h1>` → it's now `mb-1` with the helper carrying `mb-6`.)

Change the error paragraph radius token:

```tsx
            <p
              className="rounded-r-4 border border-red/30 bg-red/10 px-3 py-2 text-sm text-red"
              data-testid="change-password-error"
            >
```

Give the submit `Button` the destructive treatment via `className` (the destructive intent: red text + red hairline border, transparent fill — understated, not a loud filled red button):

```tsx
            <Button
              type="submit"
              variant="outline"
              disabled={isLoading}
              data-testid="change-password-submit"
              className="border-red/40 text-red hover:bg-red/10"
            >
              {isLoading ? "saving…" : "change password"}
            </Button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/change-password-route.test.tsx'`
Expected: PASS (existing test + 2 new).

- [ ] **Step 5: Run the token guard**

Run: `nix-shell --run 'npm run check-tokens'`
Expected: `✓` (`bg-red/10` and `text-red` are token-based; the guard only rejects raw palette colours).

- [ ] **Step 6: Commit**

```bash
git add src/routes/settings/change-password-route.tsx tests/unit/routes/settings/change-password-route.test.tsx
git commit -m "feat(unit-9-5a): destructive styling + helper text on change-password route"
```

---

### Task 8: Restyle the recovery-code route (destructive + helper text)

**Files:**
- Modify: `src/routes/settings/recovery-code-route.tsx`
- Test: Create `tests/unit/routes/settings/recovery-code-route.test.tsx`

**5-A**: revealing the recovery code exposes the master secret, so the confirm/reveal action gets the same destructive treatment + a subtle warning line. The error paragraph `rounded-r-3` → `rounded-r-4`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/routes/settings/recovery-code-route.test.tsx
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RecoveryCodeRoute } from "@/routes/settings/recovery-code-route";

vi.mock("@/auth/flows", () => ({
  viewRecoveryCode: vi.fn(async () => "word ".repeat(24).trim()),
}));

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/settings/recovery-code"]}>
      <Routes>
        <Route path="/settings/recovery-code" element={<RecoveryCodeRoute />} />
        <Route path="/settings" element={<div data-testid="settings-index" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RecoveryCodeRoute styling", () => {
  test("renders a subtle warning that the code is the master secret", () => {
    renderRoute();
    expect(
      screen.getByText(/anyone with this code can access your account/i),
    ).toBeTruthy();
  });

  test("reveal button carries the destructive red treatment", () => {
    renderRoute();
    const btn = screen.getByTestId("view-recovery-code-submit");
    expect(btn.className).toContain("text-red");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/recovery-code-route.test.tsx'`
Expected: FAIL — warning text absent; reveal button has no `text-red`.

- [ ] **Step 3: Apply the restyle**

Add a subtle warning line under the `<h1>` (applies to both the form and the revealed states):

```tsx
        <h1 className="text-xl font-bold text-text mb-1">view recovery code</h1>
        <p className="mb-6 text-[11.5px] leading-relaxed text-text-2">
          this is the master secret to your account — anyone with this code can
          access your account. only reveal it somewhere private.
        </p>
```

Change both error paragraphs' radius (there is one, in the form branch):

```tsx
              <p className="rounded-r-4 border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
```

Give the reveal submit `Button` the destructive treatment:

```tsx
              <Button
                type="submit"
                variant="outline"
                disabled={isLoading}
                data-testid="view-recovery-code-submit"
                className="border-red/40 text-red hover:bg-red/10"
              >
                {isLoading ? "…" : "show code"}
              </Button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run 'npx vitest run tests/unit/routes/settings/recovery-code-route.test.tsx'`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the token guard**

Run: `nix-shell --run 'npm run check-tokens'`
Expected: `✓`

- [ ] **Step 6: Commit**

```bash
git add src/routes/settings/recovery-code-route.tsx tests/unit/routes/settings/recovery-code-route.test.tsx
git commit -m "feat(unit-9-5a): destructive styling + helper text on recovery-code route"
```

---

### Task 9: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire unit suite**

Run: `nix-shell --run 'npm run test'`
Expected: all suites PASS (no regressions in non-settings tests; the dropped `ProfileSection`/`AccountSection`/`InvitesSection` rows in `section-titles.test.tsx` were already updated in Task 6).

- [ ] **Step 2: Type-check**

Run: `nix-shell --run 'npx tsc --noEmit'`
Expected: no errors. (Watch for unused imports in `index.tsx` — `Link`, `ProfileSection`, `InvitesSection` must be gone; `Icon` must not be imported in `sign-out-card.tsx`.)

- [ ] **Step 3: Token guard over the whole tree**

Run: `nix-shell --run 'npm run check-tokens'`
Expected: `✓ no ad-hoc Tailwind color/typography classes detected`

- [ ] **Step 4: Commit any final fixes (only if Steps 1-3 surfaced something)**

```bash
git add -A
git commit -m "chore(unit-9-5a): fix verification findings"
```

---

## Self-review checklist (run before handing off)

- [ ] **Spec coverage.**
  - 4-B card sectioning + inverted-colour fix → `Card`/`SectionLabel`/`SRow` (Tasks 1-2), `bg-panel` pinned. ✓
  - 4-C leading row icons → `Icon` map + every `SRow` takes an `icon` (Tasks 1-4). ✓
  - 4-D account first: MeRow → profile, change-password row, recovery-code row, expandable safety number → Tasks 3-4. ✓
  - 4-I sign-out = own danger-red card at bottom → Task 5 + scaffold places it last (Task 6). ✓
  - 5-A destructive + helper text on the two security routes → Tasks 7-8. ✓
  - Section order account → feedback → appearance → notifications → devices → sign-out → Task 6 scaffold. ✓
  - 9-5b coordination (insertion zone + shared `Toggle` defined, not wired) → Task 1 (`Toggle`) + Task 6 (zone comments + `data-testid`). ✓
- [ ] **Placeholder scan.** No "TBD"/"handle edge cases"/"similar to Task N". All code shown in full. ✓
- [ ] **Type consistency.**
  - Kit exports used consistently: `Icon`, `Chev`, `Toggle`, `Card`, `SectionLabel`, `SRow` (same names Tasks 1-6).
  - `SRow` prop names (`icon`, `label`, `sub`, `value`, `control`, `danger`, `last`, `onClick`, `data-testid`) match between Task 2 definition and Tasks 3-5 usage.
  - `IconName` type gates `d` props; every `d` used (`key`, `shield`, `logout`, `chev`, etc.) exists in `IPATHS`.
  - `data-testid`s preserved for e2e: `change-password-btn`, `view-recovery-code-btn`, `sign-out-btn`, `change-password-submit`, `view-recovery-code-submit`.
- [ ] **No leftover imports.** `index.tsx` drops `Link`/`ProfileSection`/`InvitesSection`; `sign-out-card.tsx` imports only `{ Card, SRow }`.
- [ ] **Token compliance.** Only token utilities used; `bg-red/10`, `border-red/40`, `text-red`, `text-on-accent`, `bg-arcan-accent`, `rounded-r-4`, `rounded-r-5`, `rounded-pill` are all token-backed and pass `check-tokens`.
```
