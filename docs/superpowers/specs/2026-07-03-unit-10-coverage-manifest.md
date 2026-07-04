# Unit 10 — Coverage Manifest

Living document (spec §9). One row per app surface: source rung, reference
artifact, parity status, inference notes (mandatory prose for Rung 3–4 rows).
Screen rows land in Phase 2/3; kit-level findings are recorded here as they
happen so nothing waits for phase exit.

## Kit-level findings (Phase 1)

### Prototype bugs fixed to intent (spec §12 "prototype quirks" — flagged, not silent)

- **Attachment veil + icon on own bubbles** (`src/ui/kit/bubble.tsx`):
  `design/proto.jsx:45` uses `alpha('#fff', .18)` / `alpha('#fff', .8)`, but
  hf-kit's `_hx()` only parses 6-digit hex — `_hx('#fff')` → `[255,15,NaN]`,
  an invalid rgba that Chromium drops entirely. The raw prototype therefore
  renders the own-side attachment placeholder with **no veil and an invisible
  icon**. Design intent is unambiguous: `design/hf-chat.jsx:126` (the
  designer's own hi-fi chat screen) uses `alpha('#ffffff', …)` at the same
  structural position. The kit implements the intent (`bg-media-veil`,
  `text-white/80`); the parity reference copy in `tests/parity/proto-cells.jsx`
  is patched accordingly (marked "patched copy" with an inline note). Parity
  compares against intent, not the bug. No other 3-digit hex `alpha()` call
  exists anywhere in `design/` (grep-verified).

### Lattice verdict (spec §5 gate)

- **KEEP** — advisory parity cell `lattice-verdict` measured 0.000% diff
  (both themes) between the existing `src/components/lattice.tsx` (Unit 7)
  and the prototype's `ArcanMark` glyph at size 58. The kit's `ArcanMark`
  adds the wordmark lockups (normal/stacked) the old component lacks; which
  of the two survives Phase 4 cleanup is decided when screen usage is known
  (they render identical glyphs).

### Deliberate kit deviations (sanctioned by spec §8)

- `TypingRow` (proto.jsx:72–82) NOT ported — typing indicators dropped
  (NOX-31/32/33).
- Phone bezel, `9:41` status bar, home-indicator strip in `MobileApp` — demo
  stage dressing, not app UI; excluded from `MobileShell`.
- `tapClass` omits the prototype `tapBtn`'s `border: none` / `background:
  transparent` (preflight provides them; carrying them as utilities breaks
  composed borders/fills). Pixel-identical.
- a11y follow-ups tracked (task list): PToggle switch role, PHeader back
  aria-label, avatar-button contract, PTabBar tablist semantics.
