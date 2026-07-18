# UI motion design — hover feedback, screen transitions, content micro-animations

Date: 2026-07-18
Status: approved (brainstorm with user, visual companion session)

## Philosophy

Motion in Arcan confirms what you did; it never decorates. Three tiers, decided
with live demos during the brainstorm:

1. **Interaction feedback** — color-only ("calm" option). No scale, no lift, no
   glow on hover/press anywhere.
2. **Screen transitions** — directional slide keyed to the navigation hierarchy.
3. **Content entrances** — rise-in for new messages, pop-in for unread badges.
   No list stagger (explicitly rejected: delays content, replays every visit).

Every animation has a `prefers-reduced-motion` fallback.

## Tokens (tokens.css + tailwind.config.ts)

- Reuse `--dur-fast` (120ms) for hover/press color shifts and cross-fades,
  `--dur-base` (200ms) for content entrances.
- New token `--dur-nav: 240ms` for screen slides (`--dur-slow` 360ms remains the
  ceiling; nothing new uses it).
- Map tokens into Tailwind: `transitionDuration: { fast, base, nav }`,
  `transitionTimingFunction: { out, in }` → components write
  `transition-colors duration-fast ease-out`. Migrate the composer send
  button's ad-hoc `duration-[150ms]` to `duration-fast`.
- New keyframes beside the existing toast/modal ones:
  - `arcan-rise`: opacity 0→1 + translateY(8px)→0, 200ms `--ease-out`.
  - `arcan-pop`: opacity 0→1 + scale(0.5)→1, 200ms `--ease-out`.
- `scripts/check-tokens.sh` gains a rule rejecting raw `duration-[...]`
  literals (named utilities only).

## Tier 1 — hover & press inventory (color-only, 120ms ease-out)

| Surface | Hover | Press/active |
|---|---|---|
| `src/components/ui/button.tsx` (all variants) | existing hover colors, now with `transition-colors duration-fast` | one step darker (primary `opacity-80`; ghost/outline deepen past `bg-panel-2`) |
| PButton (kit; currently no feedback) | primary `opacity-90`; ghost/outline `bg-panel-2`; danger `bg-red/10` | one step darker per variant |
| PRow | `bg-panel-2` | border-level darker |
| Conversation + contact rows (screens, contact-picker) | `bg-panel-2` (picker already has it — now animated) | one step darker |
| PTabBar tabs, header icon buttons (back, ⋮), FAB | icon/text dim→text + `bg-panel-2` wash | darker wash |
| PField / inputs | — | focus: border-color eases to accent, `duration-fast` |
| Message bubbles | other-bubble: border + background lighten one step; own-bubble: subtle brightness lift; per-message ⋮ affordance fades in on the same transition | held one step deeper until release (ties into round-4 long-press menu) |
| Message-menu popover items | `bg-panel-2` | darker |

No transforms in this tier. PToggle (180ms `--dur-switch`) is unchanged.

## Tier 2 — screen transitions (View Transitions API)

- New `src/nav/transitions.ts` built on `src/nav/parents.ts`:
  - target descendant of current route → **forward**: new screen slides in from
    the right (~240ms `--ease-out`), old screen parallax-nudges left (−18%).
  - target ancestor → **back**: mirrored.
  - sibling/no relation (tab roots conversations/contacts/settings, auth moves
    login↔onboarding↔recovery) → **fade** at `--dur-fast`.
- Mechanism: react-router 7.15 `viewTransition` on `Link`/`navigate`, funneled
  through one shared helper (screens do not reimplement). Helper stamps
  `data-nav-dir="forward|back|fade"` on `<html>`; tokens.css styles
  `::view-transition-old/new(root)` keyed off that attribute.
- Fallback: browsers without the API swap instantly (no polyfill). First
  implementation step verifies behavior in the Tauri Android WebView; if it
  fails there, fall back to a manual keyed-wrapper transition for mobile only
  (not expected — WebView is Chromium).
- Overlays (modals, sheets, toasts, message-menu popover) keep their existing
  entrance animations; they are not navigations.

## Tier 3 — content micro-animations

- **Messages rise in** (`arcan-rise`): bubbles appended after the timeline's
  initial render — own sends and live arrivals. Never on history load or
  conversation open (guard: timeline mounted → subsequent appends animate).
  Closes AUDIT-011 (unit 8 audit).
- **Unread badges pop** (`arcan-pop`): conversation-row badges + mobile tab-bar
  badge, on appearance and count change.
- Explicitly out of scope: list stagger, skeleton/toast/modal (already
  animated), typing indicators (do not exist).

## Accessibility

All new keyframes and all `::view-transition` rules go in the existing
`prefers-reduced-motion` block in tokens.css: content entrances become instant
appearance, screen changes become instant swaps. Hover color transitions remain
(color change without movement is reduced-motion-safe).

## Verification

- `npm run typecheck`, `npm run check-tokens`, `npm run check-ui-purity` clean.
- Parity harness stays 142/142.
- Existing Playwright e2e green — especially messaging-1to1 (bubble markup is
  touched).
- One new e2e assertion: navigation completes with view transitions enabled.
- Manual Android WebView check via `docs/testing/android-device-checklist.md`.

## Decisions log (brainstorm, 2026-07-18)

- Hover style: **A — color only** (rejected press-scale and lift/glow as "too
  much movement").
- Screen changes: **C — directional slide** (over instant and cross-fade).
- Micro-animations: send rise + receive rise + badge pop; **no** list stagger.
- Approach: **pure CSS + View Transitions API** (rejected manual wrapper as
  more code for the same visual; rejected motion library as a second animation
  idiom against the token-first system).
- User addition: message bubbles get button-like interaction feedback.
