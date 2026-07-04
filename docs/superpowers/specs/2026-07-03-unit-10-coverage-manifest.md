# Unit 10 — Coverage Manifest

Living document (spec §9). One row per app surface: source rung, reference
artifact, parity status, inference notes (mandatory prose for Rung 3–4 rows).
Screen rows land in Phase 2/3; kit-level findings are recorded here as they
happen so nothing waits for phase exit.

## Kit-level findings (Phase 1)

### Prototype bugs fixed to intent (spec §12 "prototype quirks" — flagged, not silent)

- **Composer input UA padding** (`tests/parity/proto-cells.jsx` — PChatScreen + PComposerBar):
  `design/proto.jsx:149,173` render the composer pill with bare `<input>` elements
  that carry Chrome's UA stylesheet padding (`1px 2px`). The app's global preflight
  (`@tailwind base`) resets all inputs to `padding:0; margin:0`, so the UA padding
  is absent in production. The proto-cells patched copies apply `margin:0; padding:0`
  to match the app baseline, and `minWidth:0; overflow:hidden` on the pill wrapper
  to prevent flex min-width:auto blowout in the fixed-width parity cell. Parity
  compares against the intended layout; the inline intent-fix comments in
  `proto-cells.jsx` identify the patched properties.

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

### Phase 2 handoff notes (from Phase 1 exit review)

1. **rem base 15px → 16px** (`html { font-size: 16px }`): every rem-scaled
   utility on EXISTING screens grew ~6.7%. Accepted as transitional skew
   (controller ack, 2026-07-04) — those screens are replaced wave by wave;
   do an early visual smoke of legacy screens before building on them.
2. Interactive kit primitives lacking testids (PToggle, PHeader buttons,
   PTabBar tabs) — add as Wave e2e wiring needs them (sanctioned deviation).
3. a11y follow-ups tracked in the task list (see below).
4. `PSectionLabel` deliberately pins `fontSize:16/lineHeight:1.125` (proto
   strut) — do NOT "fix" it to ambient rhythm during integration.
5. `Fab`/`KitToast` are absolutely positioned — compositions must preserve a
   `relative` ancestor (MobileShell provides one).
6. Spec §5's "hover/pressed/disabled/active" gate sentence is narrower in
   practice: the prototype has no hover/pressed CSS states, so parity gates
   prop states only (plan Ground Rule 3).

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

## Screens (Phase 2)

### Avatar image resolution — home lists (Wave A Task 5 review fix)

Container `useHomeLists` resolves avatar images via one-shot container effects
(snapshot, not reactive):

- **Own profile header**: `useState` + `useEffect` on `me.profile.avatar.data.$jazz.id`
  → `co.fileStream().loadAsBlob` → objectURL; revoked on cleanup.
- **Conversation icons**: combined effect iterates `knownConversations`; each
  entry with `icon.data.$jazz.id` is blob-loaded into the `id → objectURL` map.
  `icon: true` added to the `$each` resolve spec to make the FileBlob available.
- **Contact photos**: EFFECTIVELY INITIALS-ONLY in Wave A. The combined effect
  calls `resolveAvatarFileBlob({ accountID, me })`, but its contactBook branch
  is a documented no-op (Contact stores a plain accountID string — no
  `$jazz.refs.account` to walk; see `src/jazz/avatarResolver.ts`). The old
  Sidebar carried contact photos via the per-row `useRemoteAvatar`
  subscription, which Wave A dropped. Only the group-members path can
  occasionally yield a blob.

Deliberate, tracked deferral: reinstating the `useRemoteAvatar` mechanism (not
merely adding reactivity) is the followup; `profile-avatar.spec.ts` is
`test.fixme`'d on exactly this. Own-profile avatar + conversation icons DO
resolve (snapshot; no live remote update).

### Wave A coverage rows

| Surface | Route | Rung | Reference | Parity | Notes |
|---|---|---|---|---|---|
| Home / chats list (mobile) | `/` | 1 | proto ChatsScreen (86–114) | PASS 0.000% | presence omitted (NOX-31) |
| Home / contacts list (mobile) | `/` (contacts tab) | 1 + 4 | proto ContactsScreen (116–143) | PASS 0.000% | pendingSlot = PendingRequestsSection (Rung 4, no proto ref) |
| Desktop nav column | shell | 1 + 4 | proto DesktopApp extraction (731–780) | PASS 0.000% | active-row state via useParams; pendingSlot Rung 4 |
| Desktop empty pane | `/` desktop | 1 | proto DesktopEmpty | PASS (Phase 1 cell) | replaces EmptyPane on home |
| Desktop shell | shell | 1 (amended) | proto DesktopApp content | PASS (nav-column cells) | USER DECISION 2026-07-05: window-on-stage (DesktopWindow chrome + stage bg) rejected — nav column + pane fill the viewport. DesktopWindow stays in the kit, unmounted. |
| Mobile shell + tab bar | shell | 1 | proto MobileApp chrome | PASS (Phase 1 cell) | PTabBar on root paths only; MobileTabBar unmounted |
| Toast rendering | app-wide | 1 | proto Toast (590–600) | PASS (toast-tones) | legacy API/testids kept; stacked toasts Rung 4 |
| Empty/loading states | home | 4 | — | — | legacy copy + NavListSkeleton kept |

### Wave B coverage rows

| Surface | Route | Rung | Reference | Parity | Notes |
|---|---|---|---|---|---|
| Chat screen (mobile) | `/conversations/:id` | 1 | proto ChatScreen (154–203) | PASS 0.072% | typing + presence/verified dropped (NOX-31/33) |
| Chat screen (desktop pane) | `/conversations/:id` | 1 | proto ChatScreen, desktop w=460 | PASS 0.034% | back arrow mobile-only |
| Composer | chat | 1 + 4 | proto :189–200 | PASS (0.004 override, AA-characterized) | real upload flow container-side; pending chips + error = Rung 4 slots |
| Day markers | chat timeline | 1 + 4 | proto "today" (:185) | in-screen cells | "yesterday"/"d MMM" for older days is an inference |
| New-messages divider | chat timeline | 1 | kit new-divider (proto :56–60 equiv) | PASS (Phase 1 cell) | position from existing findNewMarkIndex |
| System-event rows | chat timeline | 1 | kit sys row | PASS (Phase 1 cell) | text via formatSystemEventMessage, kind testids kept |
| Message edit/delete | chat | 4 | — | — | menu ⋮ + inline edit restyled with kit tokens; hover-reveal dropped (menu always visible — walkthrough item) |
| Deleted/malformed states | chat | 4 | — | — | italic dim text in bubble shell, testids kept |
| Real attachments + lightbox | chat | 4 | kit Bubble attSlot | — | moved to src/components/message-attachments.tsx, behavior preserved |
| Connection banner / write-group handshake | chat | 4 | — | — | logic untouched, banner slot above timeline |

### Wave B avatar note (merge-review)

- Chat header avatar: conversation icon resolves via the Wave A one-shot
  pattern (`icon: true` resolve + blob effect in detail.tsx).
- Per-message author photos: initials-only — same per-row `useRemoteAvatar`
  mechanism as the home-list contact photos; folded into that followup task.
  The presenter fields (`authorAvatarSrc`) are wired and waiting.

### Wave B e2e drift

- First run 39/44: three attachment specs + messaging-1to1 failed on the moved
  Rung-4 surfaces. Root causes: tray/tile/lightbox testids dropped in the
  restyle; send button not armed for attachment-only messages; **paste-to-attach
  handler entirely missing** (feature regression — restored); **"(edited)"
  indicator missing** (feature regression — restored via BubbleMsg.edited);
  deleted copy assertion updated to design-language "message deleted".
- Final: 43 green + 1 fixme (profile-avatar, pre-existing).

### Wave A e2e drift (vs 44/44 baseline)

- 42/44 on first run after integration. `unread-badges` updated to the
  prototype's weight convention (unread = bold, read = semibold) — now green.
- `profile-avatar` marked `test.fixme` — contact photos don't resolve on home
  lists (see avatar section above; followup task tracks it). 43 runnable,
  43 green.
- Merge-review fix: five route roots (`/settings` + 3 sub-routes,
  `/conversations/new`) used `min-h-screen`/`h-screen`, which clips inside the
  fixed-height `DesktopWindow` (and `MobileShell`) with no scroll ancestor —
  converted to `flex-1 min-h-0` (+ `overflow-y-auto` where the route is its
  own scroll container). Wave B-D rule: route roots must fill the pane, never
  the viewport.

### Parity threshold overrides

- **`chat-composer-states` 0.004** — diffuse AA residual on › prompt / placeholder
  text / send glyph at 300×200 (small denominator amplifies per-pixel antialiasing
  noise); characterized 2026-07-04, no structural offset confirmed via triptych
  inspection (diff confined to sub-pixel glyph edges, no block/edge shifts).
