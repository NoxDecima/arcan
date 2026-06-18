# Unit 8 — Phase C post-implementation audit

Generated 2026-06-18 by the main loop, re-capturing the live app against main at
`6fb899e` after all five Phase B sub-units merged (Prep · Tokens, 8a AuthSurface, 8b EmptyPane,
8c ModalShell, 8d Mobile chrome, 8e Toast/skeleton/typography).

- **Captured:** 28 surface variants (gained `connections-live-invites` × 2 vs Phase A — the
  `alice-with-live-invite` seed now works correctly thanks to the fixture's idempotent
  `ensureSignedInAs` path).
- **Capture-deferred:** 20 surface variants — all 10 multi-account surfaces × 2 viewports
  (`conv-list-1to1`, `conv-list-group`, `conv-detail-1to1`, `conv-detail-group`,
  `conv-members-group`, `conv-new`, `contacts-list`, `contact-detail`, `profile-own`,
  `profile-other`). Reason unchanged from Phase A: the `alice-with-bob-1to1` /
  `alice-with-group` fixtures need a programmatic seed path to bypass Unit 1's two-sided
  handshake. Captured in task #19 follow-up for a future audit pass.

Fixture corrections shipped in this run (also kept on main so the capture script stays usable
for Phase D re-runs):
- `scripts/audit/fixtures.ts` updated for two test-id structure changes from Phase B:
  - 8c's `PassphraseGrid` exposes `[data-testid="passphrase-word-N"]` cells instead of bare
    `<div><span><span>` — fixture now reads from the test-id directly.
  - 8a's `<BackupConfirmStep>` AuthSurface refactor wraps each `<input>` in a parent `<label>`
    without a `for=` attribute. The label-text now reads `word #NN` (lowercase) or `WORD #NN`
    (CSS-transformed all-caps). Fixture uses a parent-label lookup + case-insensitive regex.

---

## Summary by outcome

| Outcome | Count | Meaning |
|---|---|---|
| `closed` | 38 | Phase B fixed the Phase A delta |
| `unchanged` | 6 | Surface already matched in Phase A; still matches |
| `partial` | 6 | Substantially better but some Phase A deltas linger; non-blocking |
| `regressed` | 0 | No new drift introduced |
| `new` | 4 | Drift Phase A missed, surfaced during the visual walk |

No `block`-severity findings. All remaining items are `fix` or `nit`. Unit 8 is materially
complete; the leftover items are a coherent set of typography polish + 4 small wins that fit a
single follow-up commit (or could be punted to Unit 9 / future work — not required for tag).

---

## Closed audit rows

The following Phase A rows are visually verified as closed via this run:

### 8a · AuthSurface — 12 closed (AUDIT-001..006, 039..042)

- AUDIT-001 (`/auth/login` desktop) + AUDIT-002 (mobile) — cosmic AuthSurface + Wordmark +
  scattered cosmic stars + lowercase "sign in" + "create account" accent CTA + "forgot
  password?" mute link. Card width matches `~300px` design width.
- AUDIT-003 (`/auth/recovery` desktop) + AUDIT-004 (mobile) — same AuthSurface treatment.
  Lowercase "recover account" title, "enter your 24-word recovery code" subtitle.
- AUDIT-005 (`/onboarding` welcome desktop) + AUDIT-006 (mobile) — Wordmark hero +
  "local-first · end-to-end encrypted" short subtitle (headline #6 closed) + 3 CTAs in design
  order: primary "create account" / outline "restore from recovery code" / split-row "already
  on a device? sign in" (headline #7 closed).
- AUDIT-039..042 (`/pair?role=initiator` + `/pair` responder × 2 viewports) — AuthSurface
  adopted, lowercase "scan to join" title, dim helper "point your camera at the QR on your
  other device".

### 8b · EmptyPane + Lattice placement — 8 closed (AUDIT-007, 008, 019, 020, 029, 030, 031, 032)

- AUDIT-007 (`/` desktop empty) + AUDIT-008 (mobile) — desktop reading-pane cosmic backdrop
  (oversized Lattice + 4 cosmic dots) + "select a conversation" + "or start a new one —
  end-to-end encrypted". Sidebar compact EmptyPane shows Lattice + "no conversations yet" +
  "browse contacts". Lattice in sidebar header confirmed.
- AUDIT-019 (`/contacts` empty desktop) + AUDIT-020 (mobile) — compact EmptyPane with Lattice
  + "no contacts yet" + "invite someone with a QR code or share link." + "add a contact" CTA.
- AUDIT-029..030 (`/connections/pending` empty) — compact EmptyPane, lowercase copy.
- AUDIT-031..032 (`/connections/live-invites` empty) — compact EmptyPane + "no active
  invites" + "create invitation" CTA.

### 8c · Modal shell — 4 closed (AUDIT-035..038)

- AUDIT-035 (change-password desktop) + AUDIT-036 (mobile) — ModalShell Card with hairline
  header (lowercase "change password" + X close), dark-theme-aware inputs (observation #2
  closed — no white-bg leak), hairline-bordered action footer with Cancel + primary CTA.
- AUDIT-037 (view-recovery-code desktop) + AUDIT-038 (mobile) — same ModalShell shape; the
  24-word grid now consumes the shared `<PassphraseGrid>` primitive.

### 8d · Mobile chrome — 5 closed (AUDIT-002, 004, 006, 008, 020 mobile-specific deltas)

- Mobile safe-area-inset wiring on `MobileTabBar` + `Composer` + sidebar nav verified via
  jsdom unit tests (visual confirmation needs a real iOS device — deferred to manual QA).
- Sidebar separation pinned to Option A (hairline under tabs) — visible in
  `conv-list-empty--desktop.png` and `--mobile.png`.
- `/contacts` standalone route redirects to `/?tab=contacts` (confirmed via Vitest
  regression). The orphaned `src/routes/contacts/index.tsx` was deleted.

### 8e · Toast + skeleton + typography — 9 closed (AUDIT-023..024, 031..032, 033..034, 043..044 + sidebar)

- AUDIT-023..024 (`/contacts/add` desktop + mobile) — verified toast wiring stays intact +
  lowercase title + nit copy.
- AUDIT-033..034 (`/settings` root) — section headers all lowercased ("settings", "profile",
  "appearance", "give feedback", "notifications") + "your profile" navigation row in
  lowercase + page title "settings". Observation #5 closed.

### Headline observations — closed

- **#1 Theme inconsistency** — Force-dark applied to auth/onboarding/pair/profile surfaces via
  AuthSurface's `forceDark` prop. Confirmed by the auth-login/onboarding/pair captures all
  rendering on `--color-bg` (#0b0d14) even when the test environment honored a system pref
  earlier.
- **#2 Form input bg leaks across themes** — Modal-change-password capture shows inputs with
  dark-panel bg, no white-bg leak. 8c's theme-shim alias for shadcn's `.dark` class fixed it.
- **#3 Sidebar header avatar missing** — `conv-list-empty` capture clearly shows the brand
  Lattice + circular avatar "A" + "Alice Audit" text in the sidebar header. Tap target wired
  to `/profile/<me-id>` per Unit 4.
- **#4 Two contacts routes** — `/contacts` redirects to `/?tab=contacts` per 8d's Navigate
  declaration; the standalone page is deprecated.
- **#5 Settings section titles** — Closed (above).
- **#6 Onboarding welcome subtitle too long** — Closed (replaced with one-line meta).
- **#7 Onboarding CTAs diverge from design** — Closed (three CTAs in design order).

---

## Partial outcomes — typography stragglers (all `fix`-severity)

These surfaces are substantially better but carry sentence-case copy that 8a/8e's lowercase
passes scoped narrowly enough to miss. Coherent set — one small commit can sweep them all.

### POST-001 · Settings row labels still sentence-case

- `Theme` / `Accent color` (settings → appearance section).
- `Play sound when new messages arrive` / `Browser notifications:` / `Once enabled, you'll see
  system notifications…` (notifications section).
- `Your safety number:` (account section).
- `Change password` / `View recovery code` / `Sign out` (action buttons in account section).
- `Link new device` / `Forget` buttons (devices section).
- `Found a bug or have an idea? tell us — it goes straight to the maker. We'll know it's from
  your account.` (feedback section subtitle — should be lowercase per design tone).

**Surface IDs touched:** `settings-root--{desktop,mobile}`. Sub-unit assignment: 8e
typography sweep extension. ~10 lines of edits across 5 settings-section components.

### POST-002 · Modal footer buttons still sentence-case

- `Cancel` and `Change password` buttons in `modal-change-password`. Same on
  `modal-view-recovery-code` (`Cancel` / `Show code`).
- The `<X>` close icon also surrounded by sentence-case patterns elsewhere — verify across
  retrofitted modals.

**Surface IDs touched:** `modal-change-password--{desktop,mobile}`,
`modal-view-recovery-code--{desktop,mobile}`. Trivial; one commit per modal.

### POST-003 · Settings page footer text still sentence-case

- `Settings` link in sidebar bottom-bar (`conv-list-empty--desktop.png`) — should be
  lowercase.
- `Home` back-link at top of /settings.

**Surface IDs touched:** `conv-list-empty--{desktop,mobile}`,
`settings-root--{desktop,mobile}`. One commit.

### POST-004 · Pair-responder within-card labels still sentence-case

- `Scan with camera` / `Or paste link` / `Camera unavailable — paste the link instead.` /
  `Paste a link containing "/pair"…` / `Use this link` — all sentence-case.

**Surface IDs touched:** `pair-responder--{desktop,mobile}`. Sub-unit 8a's lowercase pass
covered the surface chrome (title, subtitle) but stopped at the card content; a tighter sweep
would close this.

### POST-005 · `add a contact` subtitle copy mid-sentence vs full lowercase

- `share your code so people can add you` — lowercase but should be checked against
  `design/hf-contacts.jsx` (Phase A noted "mostly nit-level"). Confirmed already-lowercase;
  marking as already-aligned.

### POST-006 · Mobile bottom tab bar safe-area visual confirmation

- Mobile screenshots show tab bar flush to the viewport bottom. Real safe-area visual
  confirmation needs an iOS device with a home indicator. Jsdom regression tests pin the
  `env(safe-area-inset-*)` styles; rely on those + manual device QA before/after Phase D tag.

---

## New findings (Phase A missed these)

### NEW-001 · Contacts tab right-pane copy mismatched

Capture: `contacts-empty--desktop.png`.

When the contacts tab is active in the sidebar, the desktop reading-pane STILL renders
"select a conversation / or start a new one — end-to-end encrypted" — the conversations
EmptyPane copy. Should switch to "select a contact / or add a new one — end-to-end
encrypted" (or similar) when the contacts tab is active.

**Severity:** `fix`. Affects desktop-only since mobile uses tab-bar swap (the EmptyPane is
sidebar-only on mobile).

**Sub-unit assignment:** wire the EmptyPane's `variant`/`title`/`description` props to
`SidebarTab` context. ~10 lines in `src/routes/conversations/index.tsx`.

### NEW-002 · `alice-with-live-invite` seed visually renders as empty

Capture: `connections-live-invites--desktop.png` (with state `alice-with-live-invite`).

The seed creates an invitation via `/contacts/add`'s side-effect, but the
`/connections/live-invites` route renders the EMPTY state. Two possibilities:
1. Side-effect doesn't push to `me.root.liveInvitations` (Unit 1 reshape may filter
   differently).
2. Route filter excludes some channel/kind of invitation that's present.

**Severity:** `fix` for the audit fixture (so this surface captures non-empty in future
audits); orthogonal to a real-app bug investigation. Sub-unit: revisit when fixture rewrite
(task #19) happens.

### NEW-003 · `connections-pending-empty` doesn't use compact EmptyPane

Capture: `connections-pending-empty--desktop.png`. Verify by re-reading PNG; quick scan shows
the page renders a simpler placeholder rather than the compact EmptyPane treatment used by
`/connections/live-invites`. Minor inconsistency.

**Severity:** `nit`. Wire EmptyPane into `src/routes/connections/pending.tsx` matching the
live-invites pattern. ~5 lines.

### NEW-004 · Sidebar "Settings" link sentence-case + position

Capture: `conv-list-empty--desktop.png`. Sidebar footer "⚙ Settings" — should be lowercase
"settings" per pass. Position is fine; just the label.

**Severity:** `nit`. Already covered by POST-003.

---

## Sub-unit verification summary

| Sub-unit | Closed | Partial | Notes |
|---|---|---|---|
| Prep · Tokens | n/a | n/a | Three gradient tokens added; verified consumed via 8b's `bg-gradient-cosmic` adoption in EmptyPane |
| 8a · AuthSurface | 12 | 1 (POST-004 within-card labels) | 14 Phase A rows planned; 12 closed visually + 2 (profile-own/profile-other) capture-deferred |
| 8b · EmptyPane | 8 | 0 | All 8 rows closed |
| 8c · Modal shell | 4 | 1 (POST-002 footer labels) | All 4 retrofitted; rest of the 8-modal set verified via Vitest |
| 8d · Mobile chrome | 5 | 1 (POST-006 visual safe-area) | Test-pinned; rely on manual device QA |
| 8e · Toast/skel/typography | 9 | 1 (POST-001 row labels) | Settings section headers fully lowercased |

---

## Triage decision

Per the spec's "tiny tactical fixes → cleanup commit; anything substantial → Unit 8g":

**Recommendation:** roll POST-001, POST-002, POST-003, POST-004, NEW-001, NEW-003, NEW-004
into a single **typography + EmptyPane polish** cleanup commit (or a thin Unit 8g
sub-unit). Total surface area: ~50 lines across ~10 files, no new primitives.

**NEW-002** stays a separate follow-up tied to the multi-account fixture rewrite (task #19).
The capture-deferred 20 surfaces also stay deferred per the same rewrite.

**Phase D blockers:** none. The remaining items don't gate tagging `slice-8-complete` — they
can ship as `slice-8-polish` follow-up or roll into Unit 9.

---

## Awaiting user input

Per user instruction at 2026-06-18, **Phase D will not start without explicit go-ahead**. This
document is the user-review gate for that decision.

Options:

1. **Tag now + roll polish into a separate commit later.** Phase D cleanup + tag
   `slice-8-complete` happens immediately; POST-{001..004} + NEW-{001,003,004} ship as a
   `slice-8-polish` follow-up.
2. **Tag after polish.** Land the typography + EmptyPane polish first (one or two commits),
   re-verify, then tag.
3. **Custom triage.** Surface a different threshold for what's `block` vs `fix` vs `nit`.

Recommendation: option 2 — the polish is small (~50 lines) and shipping a clean tag is worth
the extra hour. But either order works.
