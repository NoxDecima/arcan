# Feedback round 3 — design

Date: 2026-07-15
Status: approved (user walkthrough feedback, 2026-07-15)

## Context

Three items of user feedback from using the Android app (v0.1.2) and the web PWA:

1. Tapping "scan their QR code" lands on an intermediate screen instead of opening
   the camera directly, and the paste-a-link alternative opens a `prompt()` dialog —
   which Tauri's Android WebView does not implement, so it silently does nothing.
2. The in-app feedback button always fails. Root cause confirmed: the API registers
   `POST /api/feedback` only when `LINEAR_API_TOKEN` is set (`api/src/index.ts`), and
   the deploy config (`deploy/docker-compose.yml`, `deploy/.env.example`) never passes
   any Linear env vars — on the VPS the endpoint does not exist, every submit 404s,
   and the client shows the misleading "couldn't send — try again".
3. Back-button loops: header back handlers are a mix of `navigate(-1)` (history back)
   and hardcoded parent paths. Cross-navigation (conversation → profile → message →
   conversation → …) ping-pongs through history endlessly. The top back button should
   always navigate hierarchically "up", never chronologically back.

## 1. QR scan straight to camera + inline paste field

### Auto-launch the native scanner

`QRScanner` (`src/qr/scanner.tsx`) gains a mount effect: when `nativeQrAvailable()`
(Tauri Android, `src/platform/qr.ts`), it immediately invokes the native barcode
scanner instead of rendering the current "open camera scanner" button. Both flows
that render `QRScanner` get this behavior:

- `/contacts/scan` (`src/routes/contacts/scan.tsx`) — add-contact scan
- `/pair` responder (`src/routes/pair/responder-step.tsx`) — device pairing

Web/desktop is untouched: the HTML5 `getUserMedia` video already auto-starts.

### Cancel / denial fallback

If the user cancels the native scanner or denies camera permission, do NOT
re-launch automatically (no trap loop). The underlying screen shows the paste
field plus a "scan again" button that re-invokes the native scanner.

### Paste = real text field

- Add-contact screen (`src/ui/screens/add-contact-screen.tsx` +
  `src/routes/contacts/add.tsx`): "or paste a link" no longer calls `prompt()`.
  It becomes an inline reveal — tapping it expands a single-line text input and
  a confirm button on the same screen. Validation reuses the existing
  `/invite`-prefix check; invalid input shows an inline error. The reveal state
  lives in the pure presenter; the container wires an `onPasteSubmit` callback
  (kit purity preserved). Confirmed URL is handled the same way as a scanned one.
- Scanner screen paste column (`src/qr/scanner.tsx`): stays as the web fallback,
  converted from textarea to a matching single-line input.

## 2. Feedback button: deploy wiring + honest error

### Deploy config (root cause)

- `deploy/.env.example`: add `LINEAR_API_TOKEN=` (empty, with a comment
  explaining feedback is disabled without it), plus commented-out optional
  overrides: `LINEAR_TEAM_ID`, `LINEAR_PROJECT_ID`,
  `LINEAR_LABEL_FEEDBACK_ID`, `LINEAR_LABEL_BUG_ID`, `LINEAR_LABEL_IDEA_ID`,
  `LINEAR_LABEL_QUESTION_ID`, `LINEAR_LABEL_NOTE_ID` (Nox/Arcan defaults are
  baked into `api/src/env.ts`).
- `deploy/docker-compose.yml`: pass `LINEAR_API_TOKEN` (and the optional
  overrides) through to the `api` service environment.
- `deploy/README.md`: new section "Feedback → Linear" — how to create a Linear
  personal API token, set it in `.env`, redeploy, and a note that the feedback
  endpoint is disabled (404) without it.

### Client error message

`src/routes/settings/feedback-route.tsx`: special-case a 404 response
(endpoint not registered = server not configured) with the toast
"feedback isn't set up on this server". All other failures keep
"couldn't send — try again".

### Deployment step (manual, post-merge)

Setting the token on the VPS and re-running compose is a manual operator step;
the README section documents it. Nothing in the repo can do this automatically.

## 3. Hierarchical "up" navigation

### Mechanism

New pure module `src/nav/parents.ts`:

- `parentOf(pathname: string, opts?: { ownProfile?: boolean }): string` — maps
  the current location to its parent path. Pure function, unit-testable.
- `useUpNavigation()` hook (same module family, e.g. `src/nav/use-up-navigation.ts`)
  wrapping `useLocation` + `useNavigate`; returns a stable `() => void` that
  navigates to `parentOf(...)`.

All screen containers replace their header `onBack` handlers — both the
`navigate(-1)` ones (`src/components/profile-view.tsx`,
`src/routes/contacts/{add,scan,detail}.tsx`, `src/routes/conversations/new.tsx`,
`src/routes/settings/index.tsx`) and the already-hardcoded ones
(`src/routes/conversations/{detail,members}.tsx`,
`src/routes/settings/feedback-route.tsx`) — with the hook, so the hierarchy has
one source of truth. `PHeader` (`src/ui/kit/pheader.tsx`) is unchanged and stays
pure; `src/nav/` lives outside `src/ui/`, so `npm run check-ui-purity` is
unaffected.

Navigation uses a normal push (no `replace`); Android system/gesture back stays
history-based (chronological), matching the platform's up-vs-back convention.
Only the in-app top back button becomes hierarchical.

### Parent map

| Screen | Up target |
|---|---|
| `/conversations/:id` | `/conversations` |
| `/conversations/:id/members` | `/conversations/:id` |
| `/conversations/new` | `/conversations` |
| `/contacts/add` | `/?tab=contacts` |
| `/contacts/scan` | `/contacts/add` |
| `/contacts/:contactID` | `/?tab=contacts` |
| `/profile/:accountID` (another user) | `/?tab=contacts` |
| `/profile/:accountID` (own profile) | `/settings` |
| `/connections/pending` | `/?tab=contacts` |
| `/connections/live-invites` | `/?tab=contacts` |
| `/settings/change-password` | `/settings` |
| `/settings/recovery-code` | `/settings` |
| `/settings/feedback` | `/settings` |
| `/settings` (mobile header back) | `/` |
| unknown | `/` |

Own-vs-other profile is decided in the profile container (it already knows whose
profile it renders); `parentOf` alone cannot tell from the path. The container
passes `{ ownProfile: true }` for the user's own profile; `parentOf` stays pure
and testable.

## 4. Invite-links row on add-contact (added 2026-07-15, second walkthrough note)

The "manage invite links" entry on `/contacts/add` is a tiny ghost-text button
at the bottom of the page — too small to find. User direction: give it a more
fitting position and rendering, but keep it visually recessive — it must not
compete with the page's main highlights (QR card, copy/share, scan button).

- Position: directly below the your-code card, above the "add someone" divider.
- Rendering: a quiet full-width utility row (max-w-[300px], hairline border,
  dim/secondary tokens): "invite links" label, active-invite count (e.g.
  "2 active"), chevron. Replaces the ghost-text button; keeps the
  `manage-invites-link` testid. Navigates to `/connections/live-invites`
  as before.
- The container (`src/routes/contacts/add.tsx`) computes the active count from
  `me.root.liveInvitations` with the same filter the live-invites route uses
  (not revoked, not expired).
- `/connections/live-invites` gets a proper `PHeader` ("invite links") with
  up-navigation (parent per the map above: `/?tab=contacts`) — it currently
  has no header or back affordance at all.

## Testing

- Unit (Vitest, `tests/unit/`):
  - `parentOf` — one assertion per row of the parent map, including the
    own-profile variant and the unknown-route fallback.
  - Paste-link validation (prefix check, trim, error case).
- E2E (Playwright, `tests/e2e/`):
  - Add-contact inline paste flow: reveal field, submit valid invite URL,
    inline error on invalid URL.
  - Back navigation: from another user's profile, header back lands on
    `/?tab=contacts` (not the chronologically previous page).
  - Invite-links row on add-contact: visible with active count, navigates
    to `/connections/live-invites`.
- Android device checklist (`docs/testing/android-device-checklist.md`), new items:
  - Scan flows open the native camera scanner immediately (no button screen).
  - Cancelling the scanner shows paste field + "scan again"; no relaunch loop.
  - Feedback submit succeeds against a token-configured server; shows
    "feedback isn't set up on this server" against an unconfigured one.

## Out of scope

- Hiding the feedback row entirely behind a server capability probe (declined —
  clearer 404 error chosen instead).
- Changing Android system/gesture back behavior.
- The VPS deployment itself (manual operator step, documented in README).
- The still-open duplicate-conversation root cause and the pending "Bundle F"
  conversation-model brainstorm (tracked separately).
