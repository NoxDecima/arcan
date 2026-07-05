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

### Avatar image resolution — home lists

Container `useHomeLists` resolves avatar images via two mechanisms:

- **Own profile header**: `useState` + `useEffect` on `me.profile.avatar.data.$jazz.id`
  → `co.fileStream().loadAsBlob` → objectURL; revoked on cleanup.
- **Conversation icons**: one-shot combined effect iterates `knownConversations`;
  each entry with `icon.data.$jazz.id` is blob-loaded into the `id → objectURL`
  map (snapshot on icon change). `icon: true` in the `$each` resolve spec.
- **Contact photos + 1:1 conversation counterpart avatars**: imperative
  per-account subscriptions via `ArcanAccount.subscribe(id, { resolve: { profile:
  { avatar: true } }, loadAs: me }, cb)`. One subscription per account ID
  (contacts ≤50 per trust-circle scope). Each subscription fires live on remote
  profile changes: callback extracts `profile.avatar.data.$jazz.id`, async-loads
  blob → objectURL, updates `remoteAvatarMap`. Cleanup: unsubscribe all + revoke
  URLs. 1:1 conversation rows fall back to the counterpart's `remoteAvatarMap`
  entry when no explicit icon is set. Followup closed 2026-07-05;
  `profile-avatar.spec.ts` un-fixme'd and passing.

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
- Per-message author photos: initials-only — the per-row `useRemoteAvatar`
  mechanism is not yet wired into the message renderer. The presenter fields
  (`authorAvatarSrc`) are wired and waiting; separate followup task.

### Wave B walkthrough decisions (2026-07-05)

- **No `@` prefix on 1:1 chat titles** — user rejected proto:175's
  `'@' + name`; plain contact name.
- **Edit/delete menu beside the bubble** (MessageRow `endSlot`, self-centered
  in the row gutter) instead of a row below it.
- **Drag-drop upload added** to the chat pane (desktop gesture the prototype
  never covered — Rung 4); same ingestion path as the attach button.
  Real-UI attach-button regression probe added (attachment-button-probe.spec).

### Wave C coverage rows

| Surface | Route | Rung | Reference | Parity | Notes |
|---|---|---|---|---|---|
| Settings | `/settings` | 1 + 4 | proto SettingsScreen (261–318) | PASS ≤0.198% (tokyo+rose) | real theme/accent setters; app notification labels + permission flow, devices soft-revoke, TTL 1h/24h/7d = data-driven props; safety-number expandable moved to profile per proto (deliberate drop from settings) |
| Feedback | `/settings/feedback` | 1 + 4 | proto FeedbackScreen (479–536) | PASS 0.086% | app categories (bug/idea/question/note); Linear submit flow untouched |
| Link device | (presenter only) | 1 | proto LinkDeviceScreen (459–478) | PASS 0.000% | UNWIRED — live pairing surface is Wave D; waiting pulse kept (loading affordance, not typing) |
| Contact profile | `/profile/:id`, `/contacts/:id` | 1 + 4 | proto ProfileScreen (205–237) | PASS (0.004 override, AA on 19px bold mono name) | AuthSurface/forceDark dropped — now pane-filling + theme-reactive (visible IA change, walkthrough item); dangerZone slot (remove-contact) Rung 4 |
| Own profile | `/profile/:me` | 1 + 4 | proto OwnProfileScreen (238–260) | PASS ≤0.145% | name edit + avatar upload flows preserved via slots |
| Conversation settings / members | `/conversations/:id/members` | 1 + 4 | proto ConvoSettingsScreen (319–356) | PASS ≤0.135% | kebab menus/kick/leave/title-edit/icon-upload preserved; ContactPicker overlay kept (9-6 decision); bespoke 70px group avatar literal-metric (sanctioned HAv bypass) |
| New conversation | `/conversations/new` | 1 + 4 | proto NewConvoScreen (357–397) | PASS ≤0.008% | contact-picker avatars initials-only (remote-avatar followup) |
| Add people | (presenter only) | 1 | proto AddPeopleScreen (433–458) | PASS ≤0.142% | UNWIRED — ContactPicker overlay kept per 9-6 decision |
| Add contact | `/contacts/add` | 1 + 4 | proto AddContactScreen (398–432) | PASS 0.000% | proto's two buttons patched to the app's single adaptive share/copy (9-7 §2-J recorded decision); QR marker + TTL flows untouched |

### Wave C parity threshold overrides

- `profile-screen` 0.004 — diffuse AA on the 19px bold JetBrains Mono display
  name ("ada · keyring", incl. U+00B7); no structural offset (characterized
  2026-07-05; own-profile passes at 0.145% with a shorter name).

### Wave C notes

- settings-kit.tsx (Unit 9-5a Icon/Toggle/Card/SRow) retired from render;
  file + isolated tests remain until Phase 4.
- use-shared-groups now derives 1:1 conversation titles from the contactBook
  counterpart (fixes "Untitled" on profile pages — followup closed).
- PToggle role="switch"/aria-checked + PHeader back aria-label live (a11y
  followup items 1-2 closed).

### Wave B e2e drift

- First run 39/44: three attachment specs + messaging-1to1 failed on the moved
  Rung-4 surfaces. Root causes: tray/tile/lightbox testids dropped in the
  restyle; send button not armed for attachment-only messages; **paste-to-attach
  handler entirely missing** (feature regression — restored); **"(edited)"
  indicator missing** (feature regression — restored via BubbleMsg.edited);
  deleted copy assertion updated to design-language "message deleted".
- Final: 43 green + 1 fixme (profile-avatar, pre-existing). Remote-avatar
  followup closed 2026-07-05: profile-avatar un-fixme'd → 44 green.

### Wave A e2e drift (vs 44/44 baseline)

- 42/44 on first run after integration. `unread-badges` updated to the
  prototype's weight convention (unread = bold, read = semibold) — now green.
- `profile-avatar` marked `test.fixme` — contact photos didn't resolve on home
  lists. Followup closed 2026-07-05: per-account subscriptions landed, spec
  un-fixme'd. 44 runnable, 44 green.
- Merge-review fix: five route roots (`/settings` + 3 sub-routes,
  `/conversations/new`) used `min-h-screen`/`h-screen`, which clips inside the
  fixed-height `DesktopWindow` (and `MobileShell`) with no scroll ancestor —
  converted to `flex-1 min-h-0` (+ `overflow-y-auto` where the route is its
  own scroll container). Wave B-D rule: route roots must fill the pane, never
  the viewport — AND own their scroll (`min-h-0 overflow-y-auto`) when content
  can exceed it (the pane itself never scrolls; the chat timeline depends on
  that). Walkthrough bug 2026-07-05: detail.tsx's main lacked min-h-0 → long
  conversations couldn't scroll and hid the composer (+ fresh attachment
  chips, masquerading as a broken attach button). Remaining content-height
  roots (pending, live-invites, contacts/add+detail, profile-view, members)
  carry the same latent clip — fix as their waves restyle them.

### Parity threshold overrides

- **`chat-composer-states` 0.004** — diffuse AA residual on › prompt / placeholder
  text / send glyph at 300×200 (small denominator amplifies per-pixel antialiasing
  noise); characterized 2026-07-04, no structural offset confirmed via triptych
  inspection (diff confined to sub-pixel glyph edges, no block/edge shifts).

### Wave C walkthrough decisions (2026-07-05)

These items were decided during the 2026-07-05 walkthrough session and are recorded
here as sanctioned deviations from the prototype or from earlier defaults.

| # | Surface | Decision | Parity impact |
|---|---------|----------|---------------|
| 1 | Settings / Feedback / Profile / Own-profile | **Desktop content cap** — content column inside Body gets `w-full max-w-[600px] mx-auto`. The proto's pane was ~620px inside DesktopWindow; our full-viewport desktop needs an explicit cap. All parity cells are 300px wide so the cap never binds. | Parity-safe (cap doesn't bind at cell width) |
| 2 | Settings MeRow | **Avatar leftmost** — proto:272 renders the HAv in the `right` slot (far right); user decision moves it to the far left. Custom button row replaces PRow to allow a leading ReactNode slot. Proto-cells.jsx PSettingsScreen MeRow patched. | Proto-cells patched (visible change) |
| 3 | Feedback form | **Email field removed** — proto:527's `email · optional` PField/input dropped; email is inferred server-side from the authenticated account session. FeedbackScreen presenter, FeedbackRoute container, and proto-cells.jsx PFeedbackScreen all updated. | Proto-cells patched (visible change) |
| 4 | Dev environment | **API proxy broadened** — vite.config.ts proxy entry changed from `"/api/auth"` to `"/api"` so that the feedback endpoint (and future `/api/*` routes) reach the dev auth-server on :4300 instead of 404-ing at Vite. Auth cookies remain same-origin. | Dev-env fix only; no parity impact |
| 5 | Toast viewport | **Desktop toast offset** — `--arcan-toast-left` CSS variable (default 0px) set to 320px by AppShell's desktop branch so toasts don't underlap the NavColumn. Coupled to NavColumn's `w-[320px]`; update both if that changes. Auth screens (no shell) keep full width. | No parity impact (toast-tones cell is narrow) |
| 7 | Profile / Own-profile | **Account-id line removed** — the "co_z1a8…4f2" sub-text below the display name (proto:217, proto:250) is dropped entirely. idTestId prop removed from both presenters. Proto-cells.jsx PProfileScreen and POwnProfileScreen patched. | Proto-cells patched (visible change) |
| 8 | Profile section order | **"view security code" moves below action-buttons** — both profile screens now order: action-button(s) → verify-safety-number → shared-conversations. Proto had shared-convos first. ProfileScreen reordered within its PCard; profile-view.tsx ownExtraSections reordered. Proto-cells.jsx PProfileScreen patched. | Proto-cells patched (visible change) |
| 9 | Contact profile | **Remove-contact button on /profile/:id** — when the viewed account has a contactBook entry, a `dangerZone` PButton (danger variant, testid `contact-remove-btn`) is rendered below the card, using the same removal flow as `/contacts/:id/detail`. | No parity impact (Rung-4 app-only) |
| 10 | PRow kit primitive | **Nested-button fix (structural a11y deviation)** — PRow wrapper changed from `<button>` to `<div role="button">` + `tabIndex=0` + Enter/Space keydown so that PToggle buttons nested in the `right` slot don't produce a React 19 "button cannot be a descendant of button" hydration error. Full keyboard semantics retained. Plain div when onClick is absent. | No parity impact (visually identical) |
