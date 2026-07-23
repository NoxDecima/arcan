# Appearance iteration — Tokyo surface ladder + UI scale

Date: 2026-07-23
Status: approved (visual-companion brainstorm; mockups archived in
`.superpowers/brainstorm/` — surface-layers, catppuccin-depth, palette-source,
ui-scale-range screens)

## Feature 1 — Tokyo Night surface ladder (both themes)

### Problem

The current surfaces are nearly flat (dark: bg `#0b0d14` / panel `#12141f` /
panel-2 `#1a1d2e`); regions are separated almost entirely by hairline borders,
making distinct areas (chrome vs content vs raised elements) hard to tell
apart.

### Decisions (brainstorm)

- Layering direction: **A — full ladder**, chrome dark → content lighter →
  raised lightest (dark mode). Rejected: "stage" inversion (chat darkest) and
  "moderate" (borders stay primary).
- Adoption depth: **surfaces only**. Text tokens, all six user accents,
  accent-soft washes, and accent-tinted own-bubbles stay EXACTLY as they are.
  Rejected: Catppuccin neutrals; full-palette accent remap.
- Palette source: **Tokyo Night** (both modes) — closest kin to the existing
  palette and the tokyo accent (`#7aa2f7` IS Tokyo Night blue). Dark rungs
  from Night+Storm (canon); light rungs are OUR derivation (Day palette is
  thin) — values below are the approved proposals. Rejected: Catppuccin
  Mocha/Latte (both authentic-grey and white-card light variants).

### Token mapping

One NEW semantic token: `--color-chrome` — structural chrome. Remaps:

| Token | Dark (now → new) | Light (now → new) | Used by |
|---|---|---|---|
| `--color-bg-stage` | `#06070d` → `#16161e` | `#e3e5ec` → `#d0d3e0` | auth/cosmic stage, Lattice backdrop |
| `--color-rail` | `#0e1019` → `#16161e` | `#eef0f5` → `#d0d3e0` | nav rail |
| `--color-chrome` (NEW) | `#1a1b26` | `#d9dce7` | list panel, headers, composer bar, tab bar, nav column |
| `--color-bg` (canvas) | `#0b0d14` → `#1f2335` | `#f5f6f9` → `#e1e2e7` | timeline/content canvas |
| `--color-panel` (raised) | `#12141f` → `#292e42` | `#ffffff` → `#eceef4` | other-bubbles, cards, popovers, fields, modals |
| `--color-panel-2` (raised-2) | `#1a1d2e` → `#414868` | `#edeff4` → `#dfe2ec` | hover washes, deeper raised step |
| `--color-border` | `#232639` → `#3b4261` | `#e3e6ed` → `#c9cdda` | hairlines (kept, now secondary to rungs) |

Untouched: `--color-text*`, `--color-dim`, all `data-accent` blocks,
`--color-bubble-own`, `accent-soft`, red/warn semantic sets.

### Component surface assignment (chrome vs raised)

The split is the only component-level change: surfaces that today use
`bg-panel` as STRUCTURE adopt `bg-chrome` (nav column, sidebar list panel,
chat header, composer bar, mobile tab bar); surfaces that are CONTENT-raised
keep `bg-panel` (bubbles-other, cards/PCard, popovers, menus, input fields,
modal panels). The implementation plan carries the full per-component mapping
table; ambiguous cases default to raised (`bg-panel`).

### Interaction with the motion vocabulary

`hover:bg-panel-2 active:bg-hairline` washes continue to work by token
indirection (both remap). On `bg-chrome` surfaces the wash steps to
`--color-panel` visually — acceptable (one rung up); no class changes to the
hover vocabulary.

### Parity

`tests/parity/` galleries: if proto-cells consume the same CSS custom
properties, both sides re-render identically and parity stays green —
verified as the plan's first step. Hex literals baked into proto-cells (if
any) are updated via the intent-fix/patched-copy convention. Target: 142/142.

## Feature 2 — UI scale (per-device, four steps)

### Decisions (brainstorm)

- Steps: **90 / 100 / 115 / 130%** as a segmented pill styled like the theme
  switcher (rejected: three steps; continuous slider — new control type,
  untestable in-between states).
- Storage: **per-device** (`localStorage`, key `arcan-ui-scale`) — NOT the
  synced `me.root.settings.appearance` (phone and desktop want different
  scales). Rejected: synced; synced+override.
- Android (Tauri shell) defaults to **115%**; web/desktop default 100%.

### Mechanism

CSS `zoom` on the app root element (`#root` or `<html>` — plan decides with a
probe). Rationale: the codebase is full of pixel-exact arbitrary values
(`w-[38px]`, `px-[11px]`, …), so root-font-size scaling would scale only
rem-based sizes; `zoom` scales text, spacing, and hit targets uniformly and is
supported by Chromium (incl. the Android WebView) and Firefox ≥126.

- Applied BEFORE first paint (inline in `index.html` or the top of
  `main.tsx`) so there is no scale flash.
- Android default: platform detection via the existing `src/platform/` layer
  (no `@tauri-apps` imports outside it).
- Settings UI: segmented pill in Settings → appearance beside the theme
  pills, same visual pattern, testids `ui-scale-90|100|115|130`.

### Flagged verification points (plan MUST cover)

1. Anchored-portal coordinate math under zoom: the message menu + sync-pill
   popover position via `getBoundingClientRect`; engines differ on zoom
   coordinate spaces — verify at 130% and divide by the zoom factor if
   needed.
2. View-Transitions pane slides at non-100% scale (snapshot geometry).
3. The image lightbox and multi-image grid at 130% on a 390px viewport
   (no overflow).
4. Parity harness pins 100% — galleries unaffected; assert the harness
   explicitly sets/ignores the localStorage key.

## Verification (both features)

- `npm run typecheck`, `check-tokens` (extended if `chrome` needs a guard
  entry), `check-ui-purity`, `check-platform-purity`.
- Full vitest; parity 142/142 (with any intent-fixes documented).
- E2e: existing suites green; one new spec asserting scale persistence
  (set 130% → reload → still 130%) and the Android-default logic unit-tested
  via the platform seam.
- Manual: both themes × one accent spot-check on desktop + mobile viewport;
  Android device checklist gains a scale + ladder section (post-merge pass).

## Out of scope

- Offline-indicator changes (user deferred, item 3 of the 2026-07-23 request).
- Any text/accent recolors (surfaces only).
- Per-conversation or per-screen density settings.
- The `zoom`-less rem-refactor of pixel values (future if `zoom` misbehaves).

## Decisions log (2026-07-23 visual brainstorm)

- Ladder direction A over stage/moderate.
- Surfaces-only over neutrals/full-palette.
- Tokyo Night over Catppuccin (both modes; light rungs are our derivation).
- Four scale steps over three/slider; per-device over synced; Android 115%.
