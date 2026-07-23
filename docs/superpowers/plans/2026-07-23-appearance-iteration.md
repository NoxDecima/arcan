# Appearance Iteration Implementation Plan — Tokyo surface ladder + UI scale

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remap the surface tokens to a Tokyo Night ladder (chrome dark → content → raised, both themes) with a new `--color-chrome` rung adopted by structural chrome, and add a per-device four-step UI scale (90/100/115/130%, CSS `zoom`, Android shell defaults 115%).

**Architecture:** Feature 1 is almost entirely a token remap in `src/styles/tokens.css` plus an 8-callsite chrome/raised class split (verified by a full `bg-*` census below) and a matching intent-fix patch on the parity proto side (proto cells consume the JS `skin()` hexes from the frozen design assets, NOT the CSS variables — both sides must move together). Feature 2 is a small pure module `src/styles/ui-scale.ts` (localStorage + `document.documentElement.style.zoom`), applied at the top of `src/main.tsx` before `createRoot` (pre-paint; the parity gallery boots via its own `parity.html` entry and never runs it), plus a segmented pill in the settings appearance card and a zoom-divide fix at the `position:fixed` portal coordinate sites.

**Tech Stack:** TypeScript strict, React 19, Tailwind v3 (token-mapped utilities), Vitest (`tests/unit/`), Playwright (`tests/e2e/`), pixelmatch parity harness (`tests/parity/`).

**Spec:** `docs/superpowers/specs/2026-07-23-appearance-iteration-design.md` (approved 2026-07-23).

**Branch:** `worktree-hardening-batch` (already carries 5 hardening/fix commits + the spec — do NOT rebase them away; the finish task presents merge options for the whole batch).

---

## Verified ground truth (resolved by reading code — trust these over assumptions)

1. **The spec's "now" hex values match `src/styles/tokens.css` exactly** (dark `bg #0b0d14 / stage #06070d / panel #12141f / panel-2 #1a1d2e / rail #0e1019 / border #232639`; light `bg #f5f6f9 / stage #e3e5ec / panel #ffffff / panel-2 #edeff4 / rail #eef0f5 / border #e3e6ed`). Surface tokens are HAND-maintained; only the accent blocks (`/* @generated accents:start */`…) come from `scripts/gen-tokens.mjs` — the remap does NOT touch the generated section and `gen-tokens.test.ts` / `tokens.test.ts` assert names, not hexes.
2. **Structural chrome today uses `bg-bg`, not `bg-panel`.** The spec's component-split paragraph guessed `bg-panel`; the census (below) shows headers, tab bar, composer bar, nav column and the desktop sidebar all paint `bg-bg`. The split is therefore `bg-bg → bg-chrome` at 7 sites plus `bg-panel → bg-chrome` at 1 site (DesktopWindow title bar). Everything else keeps its class — token indirection does the rest.
3. **Parity proto cells do NOT consume CSS custom properties.** `tests/parity/proto-cells.jsx` renders from the JS skin object built by `skin("v5", theme, accent)` (single construction site, `proto-cells.jsx:1387`), whose surface hexes live in the gitignored `design/hf-kit.jsx` (`FAM.noir`). Changing tokens.css alone would fail ~30 of 56 cells. The committed fix is an intent-fix `ladderSkin()` wrapper in `proto-cells.jsx` (Task 4) — never edit `design/` (gitignored reference assets).
4. **The parity app gallery is scale-immune by construction.** It boots via `parity.html` → `tests/parity/app-gallery/main.tsx` (NOT `index.html`/`src/main.tsx`), and `run-parity.mjs` uses fresh `chromium.launch()` pages (empty localStorage). Putting the scale application in `src/main.tsx` means the harness structurally never sees it (spec verification point 4).
5. **`getBoundingClientRect` sites in src:** `detail.tsx:207` (menu self-measure), `:538-539` (new-messages divider scroll), `:1178` (⋮ trigger anchor). The sync-status-pill popover is pure-CSS anchored (no rect math) — unaffected by zoom. The message menu portals to `document.body` with `position:fixed` — this is the one place zoom coordinate math can break (spec verification point 1, decided by the Task 1 probe).
6. **`check-tokens.sh` needs no new reject pattern** — it blacklists ad-hoc Tailwind palette classes (`bg-white`, `bg-gray-*`, …); `bg-chrome` is a token utility and passes untouched. Only the cheatsheet text gains a line.
7. **Old-hex stragglers outside tokens.css:** `index.html:8` meta `theme-color #0a0b11` and `src/components/qr-display.tsx:25` fallback `#12141f`. Both are updated in Task 3. `--color-on-accent: #0b0d14` (accent math) and `settings-screen.tsx:45` `accentCheckColor` (verbatim proto formula) are accent-domain — spec says accents stay EXACTLY as-is; do not touch.
8. **`SettingsScreen` is a pure presenter** (`check-ui-purity` forbids `@/platform` imports in `src/ui`); scale value/setter arrive as props from `src/routes/settings/index.tsx`. The parity `settings-screen` cell passes no scale props — the new row is gated on `onUiScale` being provided, so the parity cell renders unchanged (no proto-side settings patch needed).

## Surface census (2026-07-23, `grep -rnE 'bg-panel\b|bg-panel-2|bg-rail\b|bg-bg\b|bg-chrome|bg-bg-stage' src`)

~120 surface-class callsites. The chrome split touches exactly **8** (app side):

| # | File:line | Today | Becomes | Why |
|---|---|---|---|---|
| 1 | `src/ui/kit/pheader.tsx:64` | `bg-bg` | `bg-chrome` | chat/screen header (spec: headers) |
| 2 | `src/ui/kit/ptabbar.tsx:61` | `bg-bg` | `bg-chrome` | mobile tab bar |
| 3 | `src/ui/screens/home-screen-header.tsx:33` | `bg-bg` | `bg-chrome` | mobile home header |
| 4 | `src/ui/screens/chat-composer.tsx:63` | `bg-bg` | `bg-chrome` | composer bar (outer bar only — the input pill at `:80` keeps `bg-bg`: one rung lighter than chrome in dark = raised field for free) |
| 5 | `src/ui/screens/nav-column.tsx:55` | `bg-bg` | `bg-chrome` | desktop sidebar list panel |
| 6 | `src/components/app-shell.tsx:79` | `bg-bg` | `bg-chrome` | desktop sidebar wrapper (hosts the sidebar content; must match #5) |
| 7 | `src/ui/screens/new-convo-screen.tsx:171` | `bg-bg` | `bg-chrome` | footer action bar (composer-family structural bar) |
| 8 | `src/ui/kit/desktop-window.tsx:27` | `bg-panel` | `bg-chrome` | window title bar (the one `bg-panel`-as-structure site) |

**Everything else keeps its class.** Notable keeps (ambiguous → raised/keep, per spec):
`bg-bg` insets inside `bg-panel` cards (`approve-device-screen.tsx:60`, `contact-request-screen.tsx:105`, `incoming-connection-prompt.tsx:125`, `text-field.tsx:22`, `pqr.tsx:16`, `desktop-window.tsx:46` title-bar pill) become recessed wells (bg sits between chrome and panel on the new ladder); all `bg-panel` bubbles/cards/popovers/menus/fields/modals stay raised; all `hover:bg-panel-2 active:bg-hairline` washes stay (token indirection; on chrome the wash reads one rung up — accepted in spec); `bubble.tsx:77 bg-rail` attachment well follows the rail remap; canvas surfaces (`body.tsx`, `chat-screen.tsx:104`, `mobile-shell.tsx`, `app-shell.tsx:74/:111`, `auth-shell/auth-surface`, `desktop-empty`) keep `bg-bg`; HAv `ring` props keep referencing bg on both sides (parity-equal).

Proto-side mirror sites are enumerated in Task 4.

## File Structure

| Path | Change |
|---|---|
| `tests/e2e/zoom-probe.spec.ts` | Task 1 THROWAWAY probe — created, run, findings recorded, deleted |
| `src/styles/tokens.css` | Surface remap both themes + `--color-chrome` (Task 2) |
| `tailwind.config.ts` | `chrome: 'var(--color-chrome)'` color utility (Task 2) |
| `scripts/check-tokens.sh` | Cheatsheet line for `bg-chrome` (Task 2) |
| `index.html` | meta `theme-color` → new dark chrome (Task 3) |
| 8 census files above + `src/components/qr-display.tsx` | chrome split + fallback hex (Task 3) |
| `tests/parity/proto-cells.jsx` | `ladderSkin()` intent-fix + chrome patched copies + rail literals (Task 4) |
| `src/styles/ui-scale.ts` | NEW — steps, storage, normalize, apply, zoom getter (Task 5) |
| `tests/unit/styles/ui-scale.test.ts` | NEW — TDD for the pure logic (Task 5) |
| `src/main.tsx` | Pre-paint `applyStoredUiScale(isTauriAndroid())` (Task 5) |
| `src/routes/conversations/detail.tsx` | Zoom-divide at fixed-portal coords + divider scroll (Task 5, gated on probe) |
| `src/ui/screens/settings-screen.tsx` | Optional-prop-gated ui-scale row (Task 6; `settings-types.ts` untouched — the appearance props are declared inline like theme/accent) |
| `src/routes/settings/index.tsx` | Wire scale props (Task 6) |
| `tests/unit/ui/settings-ui-scale.test.tsx` | NEW — pill unit tests (Task 6) |
| `tests/e2e/ui-scale.spec.ts` | NEW — persistence + 130% menu anchoring + VT smoke (Task 7) |
| `CLAUDE.md` | Status line (Task 8) |

## Design decisions already locked (do not relitigate)

From the spec's decisions log:

- Ladder direction **A** (chrome dark → content → raised); rejected stage-inversion and moderate.
- **Surfaces only** — text tokens, all six accents, accent-soft, own-bubbles, warn/red sets stay byte-identical.
- **Tokyo Night** palette both modes; light rungs are our derivation (approved values in the spec table).
- Scale steps **90/100/115/130** as a segmented pill (no slider); **per-device** `localStorage` key `arcan-ui-scale` (NOT synced settings); Android Tauri shell defaults **115**, everything else 100.
- Mechanism: CSS `zoom` (codebase is full of px-exact arbitrary values; rem-scaling would fracture). `#root` vs `html` decided by the Task 1 probe, not by taste.
- Ambiguous surface assignments default to **raised** (`bg-panel`) / keep-as-is; the census table above is the authoritative mapping.
- Out of scope: offline-indicator changes, text/accent recolors, per-screen density, rem-refactor.

Plan-level decisions (locked here):

- The settings scale row is **gated on the `onUiScale` prop** so the parity `settings-screen` cell (which omits it) renders unchanged — recorded as an intent-fix comment (the feature postdates the frozen proto).
- Proto-side ladder lands as a **committed `ladderSkin()` patch in `proto-cells.jsx`** at the single `skin()` call — `design/` is gitignored reference material and is never edited.
- `src/styles/ui-scale.ts` stays **platform-free** (androidShell arrives as a boolean argument) so the unit tests need no platform mocks and `src/ui` purity is never at risk; `src/main.tsx` and the settings route pass `isTauriAndroid()`.
- meta `theme-color` follows the dark chrome rung (`#1a1b26`) — the Android status bar / PWA chrome must not keep the pre-ladder void color.

---

## Task 1: Zoom mechanics probe (throwaway — decides `#root` vs `html` + coordinate division)

The message menu (`AnchoredMessageMenu`, `src/routes/conversations/detail.tsx`) portals to `document.body` and positions with `position:fixed` from `getBoundingClientRect()` coordinates. Two open questions the spec defers to this probe:

1. **Zoom target.** `#root` zoom would leave `document.body` portals (the message menu) UNSCALED — visually broken by construction — so the expectation is `html` (`document.documentElement.style.zoom`). The probe confirms `html` zoom actually scales the portal content.
2. **Coordinate spaces.** Under standardized CSS zoom (Chromium ≥128, the Playwright engine), `getBoundingClientRect()` of zoomed content returns coordinates in the UNzoomed viewport space, while `left`/`top` on a fixed element *inside* the zoomed root are CSS px that get multiplied by zoom at render. If that holds, the menu at 130% lands ~30% too far right/down unless the final coords are divided by the zoom factor. The probe measures the actual drift so Task 5 applies the division only if real.

**Files:**
- Create (then DELETE in this task): `tests/e2e/zoom-probe.spec.ts`

- [x] **Step 1: Write the probe spec** — full setup mirrors `messaging-1to1.spec.ts` (two accounts, contact, one message) because the ⋮ menu only exists on messages:

```ts
// tests/e2e/zoom-probe.spec.ts — THROWAWAY (appearance-iteration Task 1).
// Decides: zoom on html vs #root; whether fixed-portal coords need /zoom.
// DELETE this file after recording the findings in the plan.
import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

test("probe: menu anchoring under css zoom 1.3", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  try {
    await pageA.goto("/");
    await createAccount(pageA, "Alice");
    await pageB.goto("/");
    await createAccount(pageB, "Bob");
    await establishContact(pageB, pageA, "Bob");
    await openDirectChat(pageA, "Bob");
    await pageA.getByTestId("composer-input").fill("probe message");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-mine")).toBeVisible();

    // ---- probe A: html zoom scales body-portal content? ----
    await pageA.evaluate(() => {
      (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = "1.3";
    });
    await pageA.getByTestId("message-mine").first().hover();
    const trigger = pageA.getByTestId("message-menu-btn").first();
    const triggerBox = (await trigger.boundingBox())!;
    await trigger.click();
    const menu = pageA.getByTestId("message-menu");
    await expect(menu).toBeVisible();
    const menuBox = (await menu.boundingBox())!;
    // Menu font size in visual px — 1.3× its 100% value proves the portal scales.
    const menuFontPx = await menu.evaluate((el) => {
      const item = el.querySelector('[role="menuitem"]')!;
      return parseFloat(getComputedStyle(item).fontSize);
    });
    console.log("PROBE html-zoom:", JSON.stringify({
      trigger: triggerBox, menu: menuBox, menuFontPx,
      // Drift: fixed coords are computed from the trigger rect; if engines
      // multiply fixed left/top by zoom, menuBox.x ≈ intended x * 1.3.
      dxFromTrigger: menuBox.x - triggerBox.x,
      dyFromTriggerBottom: menuBox.y - (triggerBox.y + triggerBox.height),
    }));

    // ---- probe B: #root zoom leaves the body portal unscaled? ----
    await pageA.keyboard.press("Escape");
    await pageA.evaluate(() => {
      (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = "";
      (document.getElementById("root")!.style as CSSStyleDeclaration & { zoom: string }).zoom = "1.3";
    });
    await pageA.getByTestId("message-mine").first().hover();
    await pageA.getByTestId("message-menu-btn").first().click();
    const menuFontPxRoot = await pageA.getByTestId("message-menu").evaluate((el) => {
      const item = el.querySelector('[role="menuitem"]')!;
      return parseFloat(getComputedStyle(item).fontSize);
    });
    console.log("PROBE root-zoom: menuFontPx =", menuFontPxRoot,
      "(unscaled ≈ same as computed 12.5px-family value → #root is disqualified)");
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
```

- [x] **Step 2: Run the probe** (sync server + vite are auto-started by the Playwright webServer config):

Run: `nix-shell --run 'npx playwright test tests/e2e/zoom-probe.spec.ts --reporter=line'`
Expected: PASS, with two `PROBE …` console lines in the output.

- [x] **Step 3: Record the decision** by editing the Decision box below in THIS plan file (fill every blank; later tasks reference it):

> **DECISION BOX (filled by Task 1, probe run 2026-07-23, chromium + firefox projects, 1280×720):**
> - Zoom target: `html` / `#root` → **`html`** (`document.documentElement.style.zoom`). Probe B evidence: under `#root` zoom 1.3 the body-portal menu keeps its baseline geometry (width **120** / height **68.2**, identical to zoom 1, both engines) — the portal escapes `#root` zoom entirely; disqualified. Probe A evidence: under `html` zoom the same menu measures **156 × 87.75** visual px = 1.3 × its `min-w-[120px]` — the portal scales. CAVEAT (honest deviation from the plan's expectation): the planned `menuFontPx` discriminator was NON-discriminating — under standardized CSS zoom `getComputedStyle` reports font-size in CSS px unaffected by ancestor zoom (**10.5** in BOTH probe A and probe B, both engines). The boundingBox width supplied the discrimination instead.
> - `dxFromTrigger` / `dyFromTriggerBottom` at 1.3 under `html` zoom: **Chromium +332.03 / +49.69** (trigger.x 1106.78, trigger.bottom 148.31; dx = 0.3 × trigger.x within 0.01 px, dy = 0.3 × trigger.bottom + 5.2 (the 4-px gap × 1.3) within 0.01 px; menu landed at x = **1438.8**, fully outside the 1280-px viewport). **Firefox +323.95 / +49.23** (trigger.x 1091.18, trigger.bottom 148.38; same ≈0.3× law — menu.x/1.3 = 1088.56 vs Playwright's trigger.x 1091.18, ~2.6 px of box-rounding slack; menu at x = **1415.1**, also off-screen).
> - Division needed: YES / NO → **YES — in BOTH Chromium and Firefox** (identical standardized-zoom semantics: `getBoundingClientRect` of zoomed content returns coordinates in the UNzoomed/visual viewport space, while `left`/`top` on the `position:fixed` body portal inside the zoomed root are CSS px multiplied by zoom at render).
> - `menuFontPx` under `html` zoom: **10.5 px (both engines) — NOT ≈1.3× the 100% value**; see the caveat in the first bullet. Portal scaling was instead confirmed by boundingBox width 156 = 120 × 1.3 (and height 87.75 ≈ 67.5 × 1.3).
> - Extra findings for Task 5: (a) `window.innerWidth` and `document.documentElement.clientWidth` stay **1280** (unzoomed) under `html` zoom in both engines — so ALL clamp inputs in `AnchoredMessageMenu` (anchor rect, self-measured menu rect, vw/vh) already live in one consistent visual/unzoomed space; the clamp arithmetic itself is space-consistent and only the FINAL `left`/`top` assignment needs the ÷zoom (no per-term correction). (b) No scrollbar/layout anomalies observed at 1280×720; View-Transition snapshots were not exercised by this probe (covered by the Task 7 VT smoke instead).

- [x] **Step 4: Delete the probe and verify a clean tree apart from the plan:**

```bash
rm tests/e2e/zoom-probe.spec.ts
git status --short   # expect: only docs/superpowers/plans/2026-07-23-appearance-iteration.md modified
```

- [x] **Step 5: Commit the recorded decision:**

```bash
git add docs/superpowers/plans/2026-07-23-appearance-iteration.md
git commit -m "docs(plan): zoom-probe findings recorded — target + coordinate-space decision"
```

---

## Task 2: Surface-ladder tokens + `chrome` utility + guard cheatsheet

Pure token change — no component classes move yet. The app will render with the new ladder everywhere `bg-bg`/`bg-panel`/etc. are used; the chrome split lands in Task 3. Both compile-level gates must stay green; parity is EXPECTED red until Task 4 (do not run it here).

**Files:**
- Modify: `src/styles/tokens.css:10-19` (dark palette incl. the `/* Palette */` comment line), `:156-164` (light palette)
- Modify: `tailwind.config.ts:49-57` (Arcan color utilities)
- Modify: `scripts/check-tokens.sh:19-22` (cheatsheet text only)

- [ ] **Step 1: Remap the dark palette** in `src/styles/tokens.css` — replace the `:root` palette block lines exactly:

```css
  /* Palette — Tokyo Night surface ladder (2026-07-23 appearance iteration):
     chrome (darkest structural) → bg (content canvas) → panel (raised) →
     panel-2 (raised-2). Dark rungs are Tokyo Night/Storm canon; text +
     accents intentionally untouched (surfaces-only adoption). */
  --color-bg: #1f2335;
  --color-bg-stage: #16161e;
  --color-panel: #292e42;
  --color-panel-2: #414868;
  --color-rail: #16161e;
  --color-chrome: #1a1b26;
  --color-border: #3b4261;
  --color-text: #c8d1f0;
  --color-text-2: #8a93b2;
  --color-dim: #5a6380;
```

(The block replaces the current lines 10-19 — `/* Palette */` through `--color-dim: #5a6380;`. Text tokens are repeated verbatim/unchanged; only the seven surface lines change and `--color-chrome` is new.)

- [ ] **Step 2: Remap the light palette** in the `:root[data-theme="light"]` block — replace the current lines 156-164 (`--color-bg: #f5f6f9;` … `--color-dim: #727892;`) with:

```css
  /* Tokyo-derived light ladder (our derivation — Day palette is thin;
     values approved in spec 2026-07-23). Text tokens unchanged. */
  --color-bg: #e1e2e7;
  --color-bg-stage: #d0d3e0;
  --color-panel: #eceef4;
  --color-panel-2: #dfe2ec;
  --color-rail: #d0d3e0;
  --color-chrome: #d9dce7;
  --color-border: #c9cdda;
  --color-text: #0d1018;
  --color-text-2: #3c425a;
  --color-dim: #727892;
```

- [ ] **Step 3: Add the `chrome` utility** in `tailwind.config.ts` — in the `extend.colors` Arcan block, directly after `rail: 'var(--color-rail)',` add:

```ts
        chrome: 'var(--color-chrome)',
```

(This yields `bg-chrome` / `text-chrome` / `border-chrome`; only `bg-chrome` is used.)

- [ ] **Step 4: Extend the `check-tokens.sh` cheatsheet** (documentation only — `bg-chrome` is a token utility and no reject pattern changes). Replace the existing cheatsheet lines:

```bash
  echo "Token cheatsheet:"
  echo "  bg-white → bg-panel        text-gray-800 → text-text"
  echo "  bg-gray-100 → bg-panel-2   text-gray-500 → text-dim"
  echo "  border-gray-200 → border-hairline"
  echo "  structural chrome (headers/tab bar/composer/nav column) → bg-chrome"
```

(The first four echo lines already exist; only the `bg-chrome` line is appended.)

- [ ] **Step 5: Verify the gates that must stay green:**

Run: `nix-shell --run 'npm run typecheck && npm run check-tokens'`
Expected: `tsc -b` silent + `✓ no ad-hoc Tailwind color/typography classes detected`

Run: `nix-shell --run 'npx vitest run tests/unit/styles/tokens.test.ts'`
Expected: PASS (asserts token NAMES exist, not hexes — verified in ground truth #1)

- [ ] **Step 6: Visual smoke** (no assertion harness — just confirm the app boots with the ladder): `nix-shell --run 'npm run dev'` briefly, load `http://localhost:5173`, confirm dark canvas is now `#1f2335` (noticeably lighter than before) and nothing is unstyled. Stop the server.

- [ ] **Step 7: Commit:**

```bash
git add src/styles/tokens.css tailwind.config.ts scripts/check-tokens.sh
git commit -m "feat(tokens): Tokyo Night surface ladder + chrome rung (both themes)"
```

---

## Task 3: Chrome/raised component split (census table, app side)

Apply the 8-line split from the census table plus the two old-hex stragglers. Each edit is a single-class (or single-hex) substitution — the surrounding classes stay byte-identical. Parity is still expected red until Task 4.

**Files:**
- Modify: `src/ui/kit/pheader.tsx:64`, `src/ui/kit/ptabbar.tsx:61`, `src/ui/screens/home-screen-header.tsx:33`, `src/ui/screens/chat-composer.tsx:63`, `src/ui/screens/nav-column.tsx:55`, `src/components/app-shell.tsx:79`, `src/ui/screens/new-convo-screen.tsx:171`, `src/ui/kit/desktop-window.tsx:27`
- Modify: `index.html:8`, `src/components/qr-display.tsx:25`

- [ ] **Step 1: PHeader** — `src/ui/kit/pheader.tsx:64`: in the container className replace `border-b border-hairline bg-bg` with `border-b border-hairline bg-chrome`, and add the mapping-table intent-fix comment on the line above the `return (` that yields this div (a `//` comment — NOT inside the JSX):

```tsx
  // intent-fix (2026-07-23 surface ladder): proto paints headers c.bg; the
  // ladder splits structural chrome from canvas — headers are chrome.
  // Mirrored in tests/parity/proto-cells.jsx (patched PHeader copy).
```

- [ ] **Step 2: PTabBar** — `src/ui/kit/ptabbar.tsx:61`: replace `border-t border-hairline bg-bg` with `border-t border-hairline bg-chrome` (same intent-fix comment pattern, referencing the patched PTabBar copy).

- [ ] **Step 3: Home header** — `src/ui/screens/home-screen-header.tsx:33`: replace `border-b border-hairline bg-bg` with `border-b border-hairline bg-chrome`.

- [ ] **Step 4: Composer bar** — `src/ui/screens/chat-composer.tsx:63`: replace `border-t border-hairline p-2.5 flex items-center gap-[9px] bg-bg` with `border-t border-hairline p-2.5 flex items-center gap-[9px] bg-chrome`. Do NOT touch the input pill at `:80` (`bg-bg` stays — it now reads one rung lighter than the chrome bar in dark mode, i.e. a raised field, matching the proto where pill and bar were the same value by coincidence of the flat palette).

- [ ] **Step 5: Nav column** — `src/ui/screens/nav-column.tsx:55`: replace `border-r border-hairline bg-bg` with `border-r border-hairline bg-chrome`.

- [ ] **Step 6: AppShell sidebar wrapper** — `src/components/app-shell.tsx:79`: replace `border-r border-hairline bg-bg` with `border-r border-hairline bg-chrome`. Leave `:74` (shell root) and `:111` (routed pane) as `bg-bg` — they are canvas.

- [ ] **Step 7: New-convo footer bar** — `src/ui/screens/new-convo-screen.tsx:171`: replace `shrink-0 p-3 border-t border-hairline bg-bg` with `shrink-0 p-3 border-t border-hairline bg-chrome`.

- [ ] **Step 8: DesktopWindow title bar** — `src/ui/kit/desktop-window.tsx:27`: replace `border-b border-hairline bg-panel` with `border-b border-hairline bg-chrome`. The title-bar pill at `:46` keeps `bg-bg` (canvas-colored inset — both gallery sides use the bg token/value, parity-equal).

- [ ] **Step 9: theme-color meta** — `index.html:8`: replace `content="#0a0b11"` with `content="#1a1b26"` (dark chrome rung; Android status bar / PWA titlebar).

- [ ] **Step 10: QR fallback hex** — `src/components/qr-display.tsx:25`: replace the fallback `"#12141f"` with `"#292e42"` (the new dark `--color-panel` — the live var read stays primary).

- [ ] **Step 11: Verify gates:**

Run: `nix-shell --run 'npm run typecheck && npm run check-tokens && npm run check-ui-purity'`
Expected: all three PASS (`bg-chrome` is a token utility; no purity change).

Run: `nix-shell --run 'npx vitest run'`
Expected: PASS (no unit test asserts surface classes on these 8 nodes — `bubble-caption.test.tsx` and friends target text/captions).

- [ ] **Step 12: Visual smoke both themes** — `npm run dev`, check dark then light (settings → theme): sidebar/header/composer/tab bar visibly darker (dark) / distinct (light) from the canvas; bubbles and cards visibly raised above the canvas.

- [ ] **Step 13: Commit:**

```bash
git add src/ui/kit/pheader.tsx src/ui/kit/ptabbar.tsx src/ui/screens/home-screen-header.tsx \
  src/ui/screens/chat-composer.tsx src/ui/screens/nav-column.tsx src/components/app-shell.tsx \
  src/ui/screens/new-convo-screen.tsx src/ui/kit/desktop-window.tsx index.html src/components/qr-display.tsx
git commit -m "feat(ui): chrome/raised surface split — structural chrome adopts bg-chrome"
```

---

## Task 4: Parity reconciliation (proto side moves to the same ladder)

Ground truth #3: proto cells render from the JS `skin()` hexes (gitignored `design/hf-kit.jsx` `FAM.noir` — the PRE-ladder values), so after Tasks 2-3 the harness diffs on every surface-bearing cell. All fixes land in the COMMITTED `tests/parity/proto-cells.jsx` via the established intent-fix/patched-copy convention (`design/` is never edited). Target: **142/142**.

**Files:**
- Modify: `tests/parity/proto-cells.jsx` (top-of-file patch, destructure line 6, lines ~51, ~135, ~173, ~195, ~305, ~663, construction site ~1387)

- [ ] **Step 1: Add the ladder skin patch** — directly after line 5 (`const { skin, alpha } = window;`) insert:

```jsx
/* intent-fix (2026-07-23 appearance iteration): Tokyo Night surface ladder.
   The shipped tokens remap the surface rungs (spec 2026-07-23) and add a
   `chrome` rung; the frozen design skin (design/hf-kit.jsx FAM.noir) still
   carries the pre-ladder values. ladderSkin() overrides the surface channels
   on the constructed skin so both gallery sides render the approved ladder.
   Text + accent channels intentionally untouched (surfaces-only adoption). */
const LADDER = {
  dark:  { stage: '#16161e', rail: '#16161e', bg: '#1f2335', panel: '#292e42', panel2: '#414868', border: '#3b4261', chrome: '#1a1b26' },
  light: { stage: '#d0d3e0', rail: '#d0d3e0', bg: '#e1e2e7', panel: '#eceef4', panel2: '#dfe2ec', border: '#c9cdda', chrome: '#d9dce7' },
};
const ladderSkin = (s) => ({ ...s, c: { ...s.c, ...LADDER[s.theme] } });
```

- [ ] **Step 2: Apply it at the single construction site** — line ~1387 in the bootstrap IIFE, replace:

```jsx
  const s = skin("v5", theme, accent);
```

with:

```jsx
  const s = ladderSkin(skin("v5", theme, accent)); // intent-fix: surface ladder (see top of file)
```

- [ ] **Step 3: Patched PHeader/PTabBar copies (chrome)** — on line 6, remove `PHeader, PTabBar` from the window destructure:

```jsx
const { Icon, HAv, PButton, PCard, PSectionLabel, PRow, PToggle, PField, PQR, tapBtn, ArcanMark, Body } = window;
```

then add the two patched copies right below the `AuthSurface` override (they shadow the proto-ui versions for every cell in this file):

```jsx
/* patched copy: design/proto-ui.jsx:17–41 (PHeader) — one intent-fix:
   background c.bg → c.chrome (2026-07-23 surface ladder; headers are
   structural chrome). Mirrors src/ui/kit/pheader.tsx. */
function PHeader({ s, title, sub, onBack, avatar, onAvatar, onTitle, right }) {
  const c = s.c;
  const titleBlock = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ font: `700 16px/1.2 ${s.headMono ? s.font : s.body}`, color: c.text, letterSpacing: s.headMono ? '-.01em' : 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
      {sub && <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ flexShrink: 0, minHeight: 52, display: 'flex', alignItems: 'center', gap: 11, padding: '0 12px', borderBottom: `1px solid ${c.border}`, background: c.chrome }}>
      {onBack && <button onClick={onBack} style={tapBtn}><Icon d="back" c={c.text2} size={20} /></button>}
      {onTitle ? (
        <button onClick={onTitle} style={{ ...tapBtn, flex: 1, minWidth: 0, gap: 11, textAlign: 'left' }}>
          {avatar}{titleBlock}
        </button>
      ) : (
        <React.Fragment>
          {avatar && <button onClick={onAvatar} style={tapBtn}>{avatar}</button>}
          {titleBlock}
        </React.Fragment>
      )}
      {right}
    </div>
  );
}

/* patched copy: design/proto-ui.jsx:45–62 (PTabBar) — one intent-fix:
   background c.bg → c.chrome (2026-07-23 surface ladder; the tab bar is
   structural chrome). Mirrors src/ui/kit/ptabbar.tsx. */
function PTabBar({ s, active, onTab }) {
  const c = s.c;
  const tab = (key, icon, label) => {
    const on = active === key;
    return (
      <button key={key} onClick={() => onTab(key)} style={{ ...tapBtn, flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 3, padding: '7px 0' }}>
        <Icon d={icon} c={on ? c.accent : c.dim} size={20} fill={false} />
        <span style={{ font: `${on ? 600 : 500} 9.5px/1 ${s.headMono ? s.font : s.body}`, color: on ? c.accent : c.dim, letterSpacing: s.headMono ? '.04em' : 0 }}>{label}</span>
      </button>
    );
  };
  return (
    <div style={{ flexShrink: 0, height: 54, display: 'flex', alignItems: 'stretch', borderTop: `1px solid ${c.border}`, background: c.chrome }}>
      {tab('chats', 'chat', 'chats')}{tab('contacts', 'people', 'contacts')}
    </div>
  );
}
```

- [ ] **Step 4: Chrome line-edits in the existing patched copies** (each is a one-value change; add `/* intent-fix: chrome (2026-07-23 ladder) */` at each changed value):
  - `~:173` (PChatScreen composer bar): outer bar `background: c.bg` → `background: c.chrome`. The input pill inside (`~:175`) KEEPS `background: c.bg`.
  - `~:195` (PComposerBar): outer bar `background: c.bg` → `background: c.chrome`. Pill (`~:197`) keeps `c.bg`.
  - `~:305` (PNavColumn root): `background: c.bg` → `background: c.chrome`.
  - `~:663` (new-convo footer bar): `background: c.bg` → `background: c.chrome`.
  - `~:135` (PDesktopWindow title bar): `background: c.panel` → `background: c.chrome`. The title-bar pill (`~:138`) keeps `background: c.bg`.

- [ ] **Step 5: Rail literals in the Bubble attachment well** — `~:51`: the hardcoded old-rail pair `(s.theme === 'dark' ? '#0e1019' : '#eef0f5')` becomes the new rail values, with the intent-fix note extended:

```jsx
      {/* intent-fix: '#fff' → '#ffffff' — … (existing note stays) …
          intent-fix (2026-07-23 ladder): rail literals #0e1019/#eef0f5 →
          #16161e/#d0d3e0 (the rail token remapped; app side uses bg-rail). */}
      {m.att && <div style={{ width: w - 12, height: 84, borderRadius: Math.max(3, s.bubbleRadius - 6), background: mine ? alpha('#ffffff', .18) : (s.theme === 'dark' ? '#16161e' : '#d0d3e0'), display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 5 }}><Icon d="image" c={mine ? alpha('#ffffff', .8) : c.dim} size={20} /></div>}
```

- [ ] **Step 6: Run the full parity harness:**

Run: `nix-shell --run 'npm run parity'`
Expected: `parity: 142/142 pass — report at tests/parity/report/`

If any cell fails: open `tests/parity/report/<theme>-<accent>/<cell>-diff.png`; a surface-colored diff region means a missed `c.bg`/`c.panel` chrome site in proto-cells (grep `background: c.` in the failing cell's render path) or a missed app-side census line — fix the SIDE THAT DIVERGES FROM THE LADDER TABLE, re-run `npm run parity -- --only <cell-id>` until green, then the full run.

- [ ] **Step 7: Commit:**

```bash
git add tests/parity/proto-cells.jsx
git commit -m "test(parity): proto-side Tokyo ladder — ladderSkin intent-fix + chrome patched copies (142/142)"
```

---

## Task 5: UI-scale module (TDD) + pre-paint application + zoom-aware portal math

The pure logic first (steps, defaults, normalize, storage), test-driven; then the one-line pre-paint hook in `main.tsx`; then the coordinate-space fixes at the `position:fixed` portal sites — gated on the Task 1 Decision box.

**Files:**
- Create: `src/styles/ui-scale.ts`
- Test: `tests/unit/styles/ui-scale.test.ts`
- Modify: `src/main.tsx` (top-level, before `createRoot`)
- Modify: `src/routes/conversations/detail.tsx` (AnchoredMessageMenu style application ~`:326-337`; divider scroll ~`:536-542`) — only if the Decision box says Division needed: YES

- [ ] **Step 1: Write the failing tests** — `tests/unit/styles/ui-scale.test.ts`:

```ts
import { describe, test, expect, beforeEach } from "vitest";
import {
  UI_SCALE_STEPS,
  UI_SCALE_KEY,
  defaultUiScale,
  normalizeUiScale,
  readStoredUiScale,
  applyUiScale,
  setUiScale,
  getUiZoom,
} from "@/styles/ui-scale";

describe("ui-scale", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.style.zoom = "";
  });

  test("exposes exactly the four approved steps", () => {
    expect([...UI_SCALE_STEPS]).toEqual([90, 100, 115, 130]);
  });

  test("defaultUiScale: 115 on the Android shell, 100 elsewhere", () => {
    expect(defaultUiScale(true)).toBe(115);
    expect(defaultUiScale(false)).toBe(100);
  });

  test("normalizeUiScale accepts stored step values", () => {
    expect(normalizeUiScale("90", false)).toBe(90);
    expect(normalizeUiScale("130", true)).toBe(130);
  });

  test("normalizeUiScale rejects junk → platform default", () => {
    expect(normalizeUiScale(null, false)).toBe(100);
    expect(normalizeUiScale(null, true)).toBe(115);
    expect(normalizeUiScale("125", false)).toBe(100); // off-scale number
    expect(normalizeUiScale("garbage", true)).toBe(115);
    expect(normalizeUiScale("", false)).toBe(100);
  });

  test("readStoredUiScale reads the arcan-ui-scale key", () => {
    window.localStorage.setItem(UI_SCALE_KEY, "130");
    expect(readStoredUiScale(false)).toBe(130);
    window.localStorage.removeItem(UI_SCALE_KEY);
    expect(readStoredUiScale(true)).toBe(115);
  });

  test("applyUiScale sets html zoom; 100% clears it", () => {
    applyUiScale(130);
    expect(document.documentElement.style.zoom).toBe("1.3");
    applyUiScale(100);
    expect(document.documentElement.style.zoom).toBe("");
  });

  test("setUiScale persists AND applies", () => {
    setUiScale(115);
    expect(window.localStorage.getItem(UI_SCALE_KEY)).toBe("115");
    expect(document.documentElement.style.zoom).toBe("1.15");
  });

  test("getUiZoom mirrors the applied factor (1 when unscaled)", () => {
    expect(getUiZoom()).toBe(1);
    applyUiScale(130);
    expect(getUiZoom()).toBe(1.3);
    applyUiScale(100);
    expect(getUiZoom()).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure:**

Run: `nix-shell --run 'npx vitest run tests/unit/styles/ui-scale.test.ts'`
Expected: FAIL — `Cannot find module '@/styles/ui-scale'` (or equivalent resolve error).

- [ ] **Step 3: Implement `src/styles/ui-scale.ts`:**

```ts
/**
 * Per-device UI scale (appearance iteration, spec 2026-07-23).
 *
 * Four steps applied as CSS `zoom` on <html> — the Task-1 probe confirmed the
 * message-menu body portal must scale with the content (a #root-scoped zoom
 * leaves document.body portals unscaled), and `zoom` (Chromium incl. Android
 * WebView; Firefox ≥126) scales the codebase's px-exact arbitrary values
 * uniformly where rem-scaling would not.
 *
 * Storage is PER-DEVICE (localStorage, not me.root.settings.appearance):
 * phone and desktop want different scales. The Android Tauri shell defaults
 * to 115%; web/desktop default 100%.
 *
 * Platform-free on purpose: callers pass `androidShell` (from
 * @/platform/is-tauri) so this module stays unit-testable without mocks and
 * importable anywhere.
 */

export const UI_SCALE_STEPS = [90, 100, 115, 130] as const;
export type UiScaleStep = (typeof UI_SCALE_STEPS)[number];
export const UI_SCALE_KEY = "arcan-ui-scale";

export function defaultUiScale(androidShell: boolean): UiScaleStep {
  return androidShell ? 115 : 100;
}

/** Parse a stored raw value; anything off the four-step scale → platform default. */
export function normalizeUiScale(
  raw: string | null,
  androidShell: boolean,
): UiScaleStep {
  const n = raw === null || raw === "" ? NaN : Number(raw);
  return (UI_SCALE_STEPS as readonly number[]).includes(n)
    ? (n as UiScaleStep)
    : defaultUiScale(androidShell);
}

export function readStoredUiScale(androidShell: boolean): UiScaleStep {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(UI_SCALE_KEY);
  } catch {
    // Storage unavailable (private mode edge cases) — fall through to default.
  }
  return normalizeUiScale(raw, androidShell);
}

export function applyUiScale(scale: UiScaleStep): void {
  // 100% clears the property entirely — a held `zoom: 1` is inert but would
  // make "is scaling active" checks ambiguous.
  document.documentElement.style.zoom = scale === 100 ? "" : String(scale / 100);
}

/** Boot path: read (or default) and apply. Called before createRoot in main.tsx. */
export function applyStoredUiScale(androidShell: boolean): void {
  applyUiScale(readStoredUiScale(androidShell));
}

/** Settings path: persist and apply immediately. */
export function setUiScale(scale: UiScaleStep): void {
  try {
    window.localStorage.setItem(UI_SCALE_KEY, String(scale));
  } catch {
    // Persisting failed — still apply for this session.
  }
  applyUiScale(scale);
}

/**
 * Effective zoom factor for fixed-portal coordinate math (Task-1 probe:
 * getBoundingClientRect returns UNzoomed-viewport px while fixed left/top
 * inside the zoomed root are multiplied by zoom at render — divide final
 * coords by this). Parses the value WE set rather than Element.currentCSSZoom
 * (Chromium ≥128 only; Firefox lacks it).
 */
export function getUiZoom(): number {
  const n = Number(document.documentElement.style.zoom);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
```

Note on types: `CSSStyleDeclaration.zoom` is a standard property in the TS DOM lib this repo compiles against (TS ≥5.5) — if `tsc` disagrees (older lib), change the `style.zoom` accesses (module AND the test file's direct reads/writes) to `(document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom` rather than loosening tsconfig.

- [ ] **Step 4: Run tests to verify pass:**

Run: `nix-shell --run 'npx vitest run tests/unit/styles/ui-scale.test.ts'`
Expected: PASS (8 tests).

- [ ] **Step 5: Pre-paint application in `src/main.tsx`** — after the `import "@/styles/tokens.css";` line add the import pair, and immediately after the import block (before the `/diag` branch) the call:

```ts
import { applyStoredUiScale } from "@/styles/ui-scale";
import { isTauriAndroid } from "@/platform/is-tauri";
```

```ts
// Per-device UI scale (spec 2026-07-23): applied before createRoot so the
// first paint is already scaled — no scale flash. The parity gallery boots
// via parity.html → tests/parity/app-gallery/main.tsx and never executes
// this module, so the harness structurally pins 100%.
applyStoredUiScale(isTauriAndroid());
```

- [ ] **Step 6 (GATED — only if Decision box says Division needed: YES): zoom-divide the AnchoredMessageMenu coordinates** in `src/routes/conversations/detail.tsx`. Add `getUiZoom` to the imports (`import { getUiZoom } from "@/styles/ui-scale";`), then in `AnchoredMessageMenu`'s returned portal replace the style expression (~`:326-337`) with:

```tsx
      // position/coords are geometry, not paint — inline style is sanctioned.
      // Coordinates are computed in (unzoomed) viewport px from rects, but
      // fixed left/top inside the zoomed <html> are multiplied by the UI-scale
      // zoom at render — divide before applying (Task-1 probe, 2026-07-23).
      style={
        pos
          ? { position: "fixed", left: pos.left / getUiZoom(), top: pos.top / getUiZoom() }
          : {
              // Pre-measure render: park at the anchor, invisible, so the
              // first paint never flashes an unclamped menu.
              position: "fixed",
              left: anchor.x / getUiZoom(),
              top: anchor.bottom / getUiZoom(),
              visibility: "hidden",
            }
      }
```

(The clamp math in the `useLayoutEffect` stays untouched — menu rect, anchor and `window.inner*` are all in the same unzoomed-viewport space; only the final CSS application crosses into the zoomed space. If the Decision box says NO, skip this edit and instead add a one-line comment above the style expression: `// Task-1 probe 2026-07-23: engine keeps fixed coords in viewport space under zoom — no division needed.`)

- [ ] **Step 7 (GATED — same condition): zoom-divide the divider scroll delta** — in the `position()` helper (~`:536-542`) the rect delta is visual px while `scrollTop` is element CSS px; replace the `target` computation with:

```ts
        const target =
          (divider.getBoundingClientRect().top -
            el.getBoundingClientRect().top) /
            getUiZoom() +
          el.scrollTop -
          8; // breathing room above the divider
```

- [ ] **Step 8: Gates + regression:**

Run: `nix-shell --run 'npm run typecheck && npm run check-ui-purity && npm run check-platform-purity'`
Expected: all PASS (ui-scale lives in `src/styles/`, not `src/ui/`; no `@tauri-apps` import anywhere new).

Run: `nix-shell --run 'npx vitest run'`
Expected: PASS.

Run: `nix-shell --run 'npx playwright test tests/e2e/messaging-1to1.spec.ts --reporter=line'`
Expected: PASS — the menu still anchors correctly at the default 100% (division by 1 is identity).

- [ ] **Step 9: Commit:**

```bash
git add src/styles/ui-scale.ts tests/unit/styles/ui-scale.test.ts src/main.tsx src/routes/conversations/detail.tsx
git commit -m "feat(scale): per-device UI scale core — storage, pre-paint zoom, portal coordinate division"
```

---

## Task 6: Settings UI — segmented scale pill + wiring + unit tests

The pill mirrors the theme-toggle cluster one-for-one (same card, same pill classes) and is gated on `onUiScale` so the parity `settings-screen` cell renders unchanged (ground truth #8). The presenter stays pure; the route owns storage/platform.

**Files:**
- Modify: `src/ui/screens/settings-screen.tsx` (props + row between theme and accent rows; `settings-types.ts` stays untouched — the new props are declared inline on the component exactly like the theme/accent props)
- Modify: `src/routes/settings/index.tsx` (state + wiring)
- Test: `tests/unit/ui/settings-ui-scale.test.tsx`

- [ ] **Step 1: Write the failing tests** — `tests/unit/ui/settings-ui-scale.test.tsx`:

```tsx
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsScreen } from "@/ui/screens/settings-screen";

const baseProps = {
  account: { name: "ada", initials: "A" },
  onOpenProfile: () => {},
  onChangePassword: () => {},
  onRecoveryCode: () => {},
  onFeedback: () => {},
  theme: "dark" as const,
  onTheme: () => {},
  accent: "tokyo",
  accentKeys: ["tokyo"],
  onAccent: () => {},
  accentSolid: { tokyo: "#7aa2f7" },
  notifications: [],
  devices: [],
  onLinkDevice: () => {},
  onSignOut: () => {},
};

const scaleProps = {
  uiScale: 100,
  uiScaleSteps: [90, 100, 115, 130] as const,
  onUiScale: () => {},
  uiScaleRowTestId: "ui-scale-row",
};

describe("SettingsScreen ui-scale pill", () => {
  test("row is absent when onUiScale is not wired (parity-cell mode)", () => {
    render(<SettingsScreen {...baseProps} uiScaleRowTestId="ui-scale-row" />);
    expect(screen.queryByTestId("ui-scale-row")).toBeNull();
  });

  test("renders the four steps with spec testids", () => {
    render(<SettingsScreen {...baseProps} {...scaleProps} />);
    expect(screen.getByTestId("ui-scale-row")).toBeInTheDocument();
    for (const n of [90, 100, 115, 130]) {
      const btn = screen.getByTestId(`ui-scale-${n}`);
      expect(btn).toBeInTheDocument();
      expect(btn.textContent).toBe(`${n}%`);
    }
  });

  test("active step carries the accent fill, inactive steps do not", () => {
    render(<SettingsScreen {...baseProps} {...scaleProps} uiScale={115} />);
    expect(screen.getByTestId("ui-scale-115").className).toContain(
      "bg-arcan-accent-fill",
    );
    expect(screen.getByTestId("ui-scale-100").className).not.toContain(
      "bg-arcan-accent-fill",
    );
  });

  test("clicking a step reports the numeric value", async () => {
    const onUiScale = vi.fn();
    render(
      <SettingsScreen {...baseProps} {...scaleProps} onUiScale={onUiScale} />,
    );
    await userEvent.click(screen.getByTestId("ui-scale-130"));
    expect(onUiScale).toHaveBeenCalledTimes(1);
    expect(onUiScale).toHaveBeenCalledWith(130);
  });
});
```

- [ ] **Step 2: Run to verify failure:**

Run: `nix-shell --run 'npx vitest run tests/unit/ui/settings-ui-scale.test.tsx'`
Expected: FAIL — `ui-scale-row` never renders (props not yet accepted; React drops unknown props silently, so the "absent" test passes but the other three fail).

- [ ] **Step 3: Add the props to `SettingsScreen`** in `src/ui/screens/settings-screen.tsx`. Destructure after `accentSolid,`:

```ts
  uiScale,
  uiScaleSteps,
  onUiScale,
```

and after `accentPickerTestId?: string;` in the type literal (plus the testid carry beside the others):

```ts
  // ui scale (appearance iteration 2026-07-23) — per-device pill; the row
  // renders only when onUiScale is wired (parity settings cell omits it).
  uiScale?: number;
  uiScaleSteps?: readonly number[];
  onUiScale?: (n: number) => void;
```

```ts
  uiScaleRowTestId?: string;            // "ui-scale-row"
```

(destructure `uiScaleRowTestId,` in the testid-carries group too).

- [ ] **Step 4: Render the row** — inside the appearance `PCard`, BETWEEN the theme row (`</div>` closing the `themeToggleTestId` div) and the accent row comment, insert:

```tsx
              {/* ui-scale row — intent-fix (2026-07-23 appearance iteration):
                  no proto reference (the feature postdates the frozen design);
                  mirrors the theme-row cluster node-for-node (icon + label +
                  segmented pill). Gated on onUiScale so the parity
                  settings-screen cell renders unchanged. */}
              {onUiScale && (
                <div
                  className="flex items-center gap-3 px-[14px] py-[12px] border-b border-hairline"
                  data-testid={uiScaleRowTestId}
                >
                  <Icon d="device" size={17} className="text-text-2" />
                  <span className="flex-1 font-body font-medium text-ui-row leading-none text-text">
                    ui scale
                  </span>
                  <div className="flex gap-0.5 p-0.5 rounded-pill bg-panel-2 border border-hairline">
                    {(uiScaleSteps ?? []).map((n) => (
                      <button
                        key={n}
                        onClick={() => onUiScale(n)}
                        data-testid={`ui-scale-${n}`}
                        className={[
                          tapClass,
                          "rounded-pill px-2 py-[5px] font-mono font-semibold text-ui-sub leading-none",
                          uiScale === n
                            ? "bg-arcan-accent-fill text-on-accent hover:opacity-90 active:opacity-80"
                            : "text-text-2 bg-transparent hover:bg-panel-2 active:bg-hairline",
                        ].join(" ")}
                      >
                        {n}%
                      </button>
                    ))}
                  </div>
                </div>
              )}
```

(`px-2` instead of the theme pill's `px-3` — four segments must fit the 600px card and a 360px mobile row; `Icon d="device"` — the per-device setting; both are intent-level choices recorded in the comment above.)

- [ ] **Step 5: Run the unit tests:**

Run: `nix-shell --run 'npx vitest run tests/unit/ui/settings-ui-scale.test.tsx'`
Expected: PASS (4 tests).

- [ ] **Step 6: Wire the route** — `src/routes/settings/index.tsx`. Add imports:

```ts
import {
  UI_SCALE_STEPS,
  type UiScaleStep,
  readStoredUiScale,
  setUiScale,
} from "@/styles/ui-scale";
import { isTauriAndroid } from "@/platform/is-tauri";
```

In `SettingsBody`, add state with the OTHER hooks (before the `if (!me.$isLoaded) return null;` early return — hooks-order law):

```ts
  // Per-device UI scale (spec 2026-07-23) — localStorage, NOT synced settings.
  const [uiScale, setUiScaleState] = useState<UiScaleStep>(() =>
    readStoredUiScale(isTauriAndroid()),
  );
  function handleUiScale(n: number) {
    if (!(UI_SCALE_STEPS as readonly number[]).includes(n)) return;
    const step = n as UiScaleStep;
    setUiScale(step); // persist + apply zoom immediately
    setUiScaleState(step);
  }
```

and pass the props to `<SettingsScreen … />` (beside the appearance props):

```tsx
      uiScale={uiScale}
      uiScaleSteps={UI_SCALE_STEPS}
      onUiScale={handleUiScale}
```

plus, in the testid-carry block:

```tsx
      uiScaleRowTestId="ui-scale-row"
```

- [ ] **Step 7: Gates:**

Run: `nix-shell --run 'npm run typecheck && npm run check-tokens && npm run check-ui-purity && npx vitest run'`
Expected: all PASS.

Run: `nix-shell --run 'npm run parity -- --only settings-screen'`
Expected: `parity: 2/2` (dark + light at the default accent — the gated row keeps the cell byte-identical).

- [ ] **Step 8: Commit:**

```bash
git add src/ui/screens/settings-screen.tsx src/routes/settings/index.tsx tests/unit/ui/settings-ui-scale.test.tsx
git commit -m "feat(settings): per-device ui-scale segmented pill (90/100/115/130)"
```

---

## Task 7: E2E — scale persistence + 130% menu anchoring + VT-at-zoom smoke

Covers spec verification points: persistence (set 130 → reload → still 130), menu anchoring under zoom (the probe's finding, now guarded forever), and a view-transitions navigation smoke at 130%. The anchoring test would FAIL without the Task-5 division (menu drifts ~30% down-right), so it locks the coordinate-space decision in.

**Files:**
- Create: `tests/e2e/ui-scale.spec.ts`

- [ ] **Step 1: Write the spec:**

```ts
import { test, expect } from "@playwright/test";
import {
  createAccount,
  establishContact,
  openDirectChat,
  openMembers,
} from "./helpers";

/**
 * E2E for the per-device UI scale (appearance iteration 2026-07-23).
 *
 * - Persistence: the pill writes localStorage `arcan-ui-scale` and applies
 *   CSS zoom on <html> immediately; a reload re-applies it pre-paint.
 * - Anchoring: the message menu portals to document.body with position:fixed;
 *   under zoom its coords are divided by the factor (Task-5 fix). Both boxes
 *   are measured with boundingBox() (same coordinate space), so the
 *   assertions hold regardless of engine zoom semantics.
 * - VT smoke: an SPA navigation at 130% completes (pane transition doesn't
 *   wedge). Visual slide quality is a manual check (plan Task 8).
 */
test.describe("UI scale", () => {
  test("scale pill persists across reload and applies html zoom", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await createAccount(page, "Alice");
    await page.goto("/settings");

    await page.getByTestId("ui-scale-130").click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.zoom))
      .toBe("1.3");
    expect(
      await page.evaluate(() => localStorage.getItem("arcan-ui-scale")),
    ).toBe("130");

    await page.reload();
    await expect(page.getByTestId("settings-body")).toBeVisible({
      timeout: 15_000,
    });
    // Re-applied pre-paint from storage.
    expect(
      await page.evaluate(() => document.documentElement.style.zoom),
    ).toBe("1.3");
    // Pill reflects the stored step.
    await expect(page.getByTestId("ui-scale-130")).toHaveClass(
      /bg-arcan-accent-fill/,
    );

    // Back to 100% clears the zoom property entirely.
    await page.getByTestId("ui-scale-100").click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.zoom))
      .toBe("");
  });

  test("message menu anchors to its trigger at 130%", async ({ browser }) => {
    test.setTimeout(120_000);
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    try {
      await pageA.goto("/");
      await createAccount(pageA, "Alice");
      await pageB.goto("/");
      await createAccount(pageB, "Bob");
      await establishContact(pageB, pageA, "Bob");
      await openDirectChat(pageA, "Bob");
      await pageA.getByTestId("composer-input").fill("scale probe");
      await pageA.getByTestId("composer-send-btn").click();
      await expect(pageA.getByTestId("message-mine")).toBeVisible();

      // Switch this device to 130% and reload into the conversation.
      await pageA.evaluate(() =>
        localStorage.setItem("arcan-ui-scale", "130"),
      );
      await pageA.reload();
      await expect(pageA.getByTestId("conversation-detail")).toBeVisible({
        timeout: 15_000,
      });
      expect(
        await pageA.evaluate(() => document.documentElement.style.zoom),
      ).toBe("1.3");

      await pageA.getByTestId("message-mine").first().hover();
      const trigger = pageA.getByTestId("message-menu-btn").first();
      const tBox = (await trigger.boundingBox())!;
      await trigger.click();
      const menu = pageA.getByTestId("message-menu");
      await expect(menu).toBeVisible();
      const mBox = (await menu.boundingBox())!;

      // Vertically adjacent: 4px gap (×1.3 zoom ≈ 5.2) below the trigger, or
      // flipped above it near the viewport bottom. Allow rounding slack.
      const below = mBox.y - (tBox.y + tBox.height);
      const above = tBox.y - (mBox.y + mBox.height);
      const vGap = mBox.y >= tBox.y + tBox.height ? below : above;
      expect(vGap).toBeGreaterThanOrEqual(0);
      expect(vGap).toBeLessThanOrEqual(10);
      // Horizontally attached to the trigger (menu opens at the trigger's
      // left edge, or right-aligned to it when clamped at the viewport edge).
      expect(tBox.x).toBeGreaterThanOrEqual(mBox.x - 8);
      expect(tBox.x).toBeLessThanOrEqual(mBox.x + mBox.width + 8);
      // Fully inside the viewport (the clamp math survived the zoom).
      const vp = pageA.viewportSize()!;
      expect(mBox.x).toBeGreaterThanOrEqual(0);
      expect(mBox.y).toBeGreaterThanOrEqual(0);
      expect(mBox.x + mBox.width).toBeLessThanOrEqual(vp.width + 1);
      expect(mBox.y + mBox.height).toBeLessThanOrEqual(vp.height + 1);

      // Functional proof: the items are hit-testable where they render.
      await pageA.getByTestId("message-edit-btn").click();
      await expect(pageA.getByTestId("message-edit-input")).toBeVisible();
      await pageA.keyboard.press("Escape");

      // VT-at-zoom smoke: an SPA navigation (chat → members) completes.
      await openMembers(pageA);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
```

- [ ] **Step 2: Run the new spec:**

Run: `nix-shell --run 'npx playwright test tests/e2e/ui-scale.spec.ts --reporter=line'`
Expected: PASS (2 tests). If the anchoring assertions fail with vGap ≈ 0.3 × the trigger's viewport-y, the Task-5 division is missing/inverted — re-check the Decision box before touching tolerances.

- [ ] **Step 3: Regression — the specs that share these surfaces:**

Run: `nix-shell --run 'npx playwright test tests/e2e/messaging-1to1.spec.ts tests/e2e/settings-controls.spec.ts tests/e2e/navigation-transitions.spec.ts --reporter=line'`
Expected: PASS (menu at 100%, settings card layout, view transitions at default scale).

- [ ] **Step 4: Commit:**

```bash
git add tests/e2e/ui-scale.spec.ts
git commit -m "test(e2e): ui-scale persistence + 130% menu anchoring + VT smoke"
```

---

## Task 8: Full sweep, manual spot-checks, status, finish

**Files:**
- Modify: `CLAUDE.md` (status line)

- [ ] **Step 1: Full gate battery** — every one must pass:
  - `nix-shell --run 'npm run typecheck'` — expect PASS
  - `nix-shell --run 'npm run check-tokens'` — expect PASS
  - `nix-shell --run 'npm run check-ui-purity'` — expect PASS
  - `nix-shell --run 'npm run check-platform-purity'` — expect PASS
  - `nix-shell --run 'npx vitest run'` — expect PASS (incl. the 12 new tests)
  - `nix-shell --run 'npm run parity'` — expect **142/142** (fresh pages, no `arcan-ui-scale` key, `parity.html` entry — the harness pins 100% by construction; spec verification point 4)
  - `nix-shell --run 'npx playwright test'` — expect PASS (full e2e)

- [ ] **Step 2: Manual spot-checks** (`npm run sync` + `npm run dev`, then in the browser — these are the spec's manual verification points; note anything off as a followup rather than silently patching):
  - Both themes × one non-default accent (e.g. rose): chrome/canvas/raised rungs read as three distinct levels on desktop AND a 390px mobile viewport; own-bubble tint and accent washes unchanged.
  - At 130%: pane slide navigation (chats → chat → back) looks correct, not just non-wedged (spec flagged point 2).
  - At 130% on a 390×844 viewport: image lightbox and the multi-image grid don't overflow horizontally (spec flagged point 3 — send a multi-image message to check).
  - At 90%: nothing clips in the settings appearance card.

- [ ] **Step 3: CLAUDE.md status** — append to the UI-rework status list (after the "Contact & connection robustness" line if that merged first, otherwise after "UI motion"):

```md
- Appearance iteration (2026-07-23) — implemented + merged (`--no-ff`). Tokyo Night
  surface ladder both themes: new `--color-chrome` rung + surface remap in tokens.css;
  8-callsite chrome/raised split (headers, tab bar, composer bar, nav column/sidebar,
  new-convo footer, DesktopWindow title bar — structural chrome was `bg-bg`, NOT
  `bg-panel` as the spec guessed); parity proto side follows via the committed
  `ladderSkin()` intent-fix in proto-cells.jsx (proto consumes skin() hexes, not CSS
  vars) — 142/142. Per-device UI scale 90/100/115/130% as CSS zoom on <html>
  (`src/styles/ui-scale.ts`, localStorage `arcan-ui-scale`, Android shell defaults
  115%), applied pre-paint in main.tsx; fixed-portal coords (message menu, divider
  scroll) divide by `getUiZoom()`. Android device checklist scale+ladder section is a
  post-merge pass. Spec: `docs/superpowers/specs/2026-07-23-appearance-iteration-design.md`.
```

- [ ] **Step 4: Commit:**

```bash
git add CLAUDE.md
git commit -m "docs: appearance-iteration status in CLAUDE.md"
```

- [ ] **Step 5: Finishing task** — use the **superpowers:finishing-a-development-branch** skill. Context the skill needs:
  - This branch (`worktree-hardening-batch`) carries the **5 earlier hardening/fix commits + the spec + this plan's commits** — the integration decision covers the whole batch, so present the options (merge `--no-ff` to `main` per repo convention / PR / hold) rather than assuming. Do NOT tag (`v*` deploys production and needs explicit user confirmation).
  - Remind the user that **followups #57 and #53** remain open in the TaskList (`metadata.kind = "followup"`) — run the `followup-tracking` triage flow (Linear destination: team=Nox project=Arcan, no prompting needed). Add the Android device-checklist scale+ladder section (Step 2 note) as a new followup if not already captured.

---

## Spec → task coverage

| Spec item | Task(s) |
|---|---|
| F1 token mapping table — 6 remapped tokens + NEW `--color-chrome`, both themes | 2 |
| F1 untouched set (text, dim, accents, bubble-own, accent-soft, warn/red) | 2 (blocks repeat text tokens verbatim; accent blocks never edited) |
| F1 component split: chrome adopters vs raised keepers, full mapping table | Census table (header) + 3 |
| F1 ambiguous → raised default | Census "keeps" list + 3 |
| F1 hover-wash vocabulary unchanged (token indirection) | 3 (no wash class touched), 8 manual |
| F1 parity: proto-cells hex path → intent-fix/patched-copy, target 142/142 | 4 (+ ground truth #3), 8 |
| F2 four steps 90/100/115/130, segmented pill like theme switcher | 6 |
| F2 per-device localStorage `arcan-ui-scale` (NOT synced) | 5 |
| F2 Android Tauri default 115%, web/desktop 100% | 5 (defaultUiScale + main.tsx seam), unit-tested |
| F2 CSS zoom on `#root` vs `html` — decided by probe | 1 (Decision box), 5 |
| F2 pre-paint application (no scale flash) | 5 (main.tsx before createRoot), 7 (reload assert) |
| F2 settings pill testids `ui-scale-90\|100\|115\|130` | 6 |
| Flagged 1: anchored-portal coordinate math at 130% (menu + pill) | 1, 5, 7 (pill is pure-CSS anchored — ground truth #5) |
| Flagged 2: View-Transitions at non-100% | 7 (completion smoke), 8 (visual manual) |
| Flagged 3: lightbox + multi-image grid at 130% / 390px | 8 (manual) |
| Flagged 4: parity harness pins 100% | Ground truth #4, 4 + 8 (harness runs green post-change) |
| Verification: typecheck / check-tokens (guard extension) / purity gates | 2 (cheatsheet — no reject pattern needed), 8 |
| Verification: full vitest; parity 142/142 with documented intent-fixes | 5, 6 (new tests), 4, 8 |
| Verification: e2e suites green + new persistence spec + Android-default unit-tested | 7, 5, 8 |
| Verification: manual themes×accent, mobile viewport; Android checklist post-merge | 8 (steps 2, 5) |
| Out of scope (offline indicator, recolors, density, rem-refactor) | untouched — no task drifts into them |

