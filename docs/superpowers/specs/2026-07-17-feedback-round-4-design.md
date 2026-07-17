# Feedback round 4 — design

Date: 2026-07-17
Status: approved (user walkthrough feedback, 2026-07-16)

## Context

Four message-timeline issues from using the app:

1. Timestamps render inside the text bubbles; the user wants them outside —
   decided: below the bubble.
2. On mobile, sent images can render wider than their bubble and "pop out".
   Root cause: `src/components/attachment-tile.tsx` sets `maxWidth: 280` as an
   inline style, which overrides the `max-w-full` class (inline styles beat
   classes), while the mobile bubble caps at 190px (`bubbleWidth` in
   `src/routes/conversations/detail.tsx`).
3. On mobile, the inline message-edit UI looks off. Root cause: the edit
   container is hard-coded `w-[220px]` inside the 190px-max mobile bubble.
4. The per-message edit/delete controls render as inline-flow buttons squeezed
   into the gutter beside the bubble — no positioning, no backdrop — unlike
   the conversation-header menu which already uses an anchored
   absolute-positioned pattern.

## 1. Timestamps below the bubble

- The time moves out of the bubble body into a caption rendered under each
  bubble by `MessageRow` (`src/ui/kit/bubble.tsx`), aligned to the bubble's
  edge: right-aligned for own messages, left-aligned for theirs.
- Caption content: `HH:MM` (existing locale format from `detail.tsx`), or
  `HH:MM · edited` for edited messages. The in-bubble time span AND the
  in-bubble "(edited)" line are removed; the bubble body renders only the
  message content.
- Styling: existing timestamp tokens — `font-mono font-medium text-ui-time
  text-dim` — with a small top gap to the bubble.
- System messages, deleted-message placeholders, and the new-messages divider
  are unchanged.
- `BubbleMsg` keeps `time` and `edited` fields; only where they render moves.
- Parity: the `bubble-own`, `bubble-theirs`, `bubble-att` cells change pixels.
  The proto-local copies in `tests/parity/proto-cells.jsx` are patched to the
  new layout with an intent-fix note (mapping-table law), and the app-gallery
  fixtures updated if needed.

## 2. Image overflow fix

- `src/components/attachment-tile.tsx` (sent-image tile): replace the inline
  `style={{ maxWidth: 280, maxHeight: 280 }}` with
  `style={{ maxWidth: "min(280px, 100%)", maxHeight: 280 }}` so the image can
  never exceed its container while small images keep natural size.
  `object-contain` and the `max-w-full` class stay.
- The pending-upload tile (fixed 80×80, `overflow-hidden`) is already safe —
  no change.

## 3. Edit-mode width fix

- In `src/routes/conversations/detail.tsx`, the edit container's `w-[220px]`
  becomes an inline width of `Math.min(220, bubbleWidth - 24)`:
  desktop keeps today's 220px; mobile yields 166px, which fits inside the
  190px bubble with its padding.
- The input keeps `flex-1`; the save/cancel row is unchanged.

## 4. Message menu: anchored popover + long-press + right-click

### Popover

- The inline gutter buttons are replaced with the positioned-menu pattern
  already used by the conversation-header menu (`detail.tsx` header menu):
  a `relative` wrapper around the ⋮ button; when open, a full-screen
  invisible backdrop (`fixed inset-0 z-10`, closes on tap) plus an `absolute`
  menu (`z-20`, `min-w`, vertical list, `rounded-r-4 border border-hairline
  bg-panel shadow-bubble`) with two items: edit, delete.
- Anchor: the menu opens below the ⋮ button (`top-full mt-1`), horizontally
  toward the message center — i.e. away from the nearer viewport edge. The
  exact `left-0`/`right-0` choice is resolved at implementation against the
  row's real flex order (own rows are `flex-row-reverse`; the kebab sits in
  the gutter on the bubble's free side).
- Existing testids stay: `message-menu-btn`, `message-edit-btn`,
  `message-delete-btn`.

### Triggers (all open the same popover, own messages only)

1. Click/tap on the ⋮ button (existing).
2. Long-press on the bubble, touch only: `pointerType === "touch"`, ~500 ms
   hold; cancelled when the pointer moves > 10px or is released early, so
   timeline scrolling is never hijacked. When the menu opens via long-press,
   the WebView's native context menu is suppressed.
3. Right-click on the bubble (mouse): `contextmenu` is intercepted with
   `preventDefault` on own-message bubbles only; elsewhere the browser's
   native context menu is untouched.

- Kit purity: `MessageRow` gains two presentational callback props —
  `onBubbleLongPress?: () => void` and `onBubbleContextMenu?: () => void`.
  The kit implements the interaction detection internally (pointer-event
  timer with touch-only + move-cancel guards for long-press; `preventDefault`
  on `contextmenu` only when the callback is provided) — pure UI behavior,
  no Jazz/router, purity guard unaffected. The container (`detail.tsx`)
  passes both callbacks (both simply open the message menu) only for own,
  non-deleted, non-editing messages.

## Testing

- Unit (Vitest):
  - Bubble caption: time renders below the bubble (not inside), `· edited`
    variant, own vs their alignment.
  - Edit-container width: `Math.min(220, bubbleWidth - 24)` behavior at 190
    and 460.
- E2E (Playwright):
  - `messaging-1to1.spec.ts` edit/delete steps updated for the popover
    (items now live in a floating panel behind the ⋮ trigger).
  - `attachment-image.spec.ts` stays green.
- Parity: patched bubble cells; no-regression on the remaining cells
  (this environment's harness is baseline-only — compare percentages, not
  absolute pass count).
- Android device checklist additions: long-press opens the menu; scrolling
  over a message does not; a wide image stays inside its bubble; the edit
  input fits on screen; right-click behavior verified on desktop web.

## Out of scope

- Timestamp grouping (last-in-group only) — declined; every message keeps its
  caption.
- Bottom-sheet action menu on mobile — declined in favor of the anchored
  popover.
- Menus/actions on other people's messages (nothing exists today; triggers
  stay own-message-only).
- The pending brainstorms from earlier rounds (conversation model "Bundle F",
  identity-code rename).
