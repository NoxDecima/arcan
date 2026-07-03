# Unit 10 — Prototype Transliteration Rebuild

**Status:** approved design, not started
**Date:** 2026-07-03
**Depends on:** Units 5, 7, 1, 2, 4, 8, 9 (all merged); e2e suite green at `e3eda51`
**Supersedes:** the audit-→-fix alignment method used in Units 8 and 9

## 1. Problem

After two full alignment passes (Unit 8 screenshot audits, Unit 9 IA/interaction
pass) the app still deviates from the design in many small ways — "death by a
thousand cuts": every screen is ~90% right, none is 100%, and each audit pass
catches only a sample of the remaining deviations.

Root cause: every unit so far has worked as *"look at the design, then write
our own code that resembles it."* The design reference (`design/proto.jsx` +
`design/hf-*.jsx`) is inline-styled prototype JSX; the app re-expresses each
screen by hand in Tailwind/shadcn components. Each re-expression is a lossy
translation, and audits sample the loss after the fact. The process asymptotes
below full fidelity **by construction**. More audit passes move which ~10% is
missing; they cannot converge.

## 2. Decision

Remove the translation step. The prototype's **code** — not its rendered look —
becomes the source of truth. The presentational layer of the app is rebuilt by
*transliterating* the prototype: primitives ported 1:1 into a typed, tokenized
kit, then each screen's JSX tree copied node-for-node, with real Jazz data fed
in through thin containers. Deviations become diffs in a copy — findable
mechanically — rather than judgment calls.

Alternatives considered and rejected:

- **Prototype-verbatim adoption** (run proto.jsx screens nearly as-is, keep
  inline-style skin system): highest short-term fidelity but permanently
  imports the prototype's non-production traits (window globals, inline
  styles, no a11y, no token system; `check-tokens` becomes meaningless).
- **Parity harness + burn-down on the existing code**: cheapest, but each fix
  is still a hand-translation into the old component decomposition — the loss
  mechanism survives; asymptotes below 100%.

## 3. Survival map

### Survives untouched

- `src/jazz/` entirely — schemas, invitation/conversation/pairing logic,
  `useIncomingConnectionRequestInbox`, avatar resolver (~3.4k lines of tested
  logic).
- Route structure and URLs (the `App.tsx` route table), auth gating, the
  invite-replay sessionStorage stash, the app-level inbox subscription
  placement.
- `useTheme` / `useAccent` persistence mechanics
  (`me.root.settings.appearance`).
- Toast *semantics*: `useToast({ tone })` call sites keep working; the toast's
  rendering is re-skinned to the prototype's `Toast`.

### Built new

- `src/ui/kit/` — the transliterated primitive kit (see §5).
- `src/ui/screens/` — pure screen presenters, one per screen (see §7).
- `src/ui/format.ts` — formatting utilities copied from the prototype
  (time rendering, truncation, initials).
- Containers — today's route files, shrunk to data wiring + presenter render.
- `tests/parity/` — throwaway pixel-diff harness (see §6). Not in CI.

### Dies at cleanup (Phase 4)

- Old presentational components in `src/components/` superseded by the kit
  (sidebar, empty-pane, auth-surface, avatar, toast rendering, skeleton
  visuals, etc.).
- shadcn/ui primitives except where they provide behavior we keep (portal /
  focus-trap machinery for the three sanctioned overlays: incoming
  connection-request pop-up, image lightbox, trusted-device prompt). Anything
  kept is re-skinned through the kit.

## 4. Tokens (Phase 0)

`src/styles/tokens.css` gets a one-time reconciliation: every literal the
prototype's v5 skin produces (colors per theme × 6 accents, radii — incl. the
pill / r-12 / avatar-10 system — spacing, type scale, shadows, motion
durations) is extracted from `design/hf-kit.jsx` (`VARIANTS.v5`, `ACCENTS`,
`FAM`) and `design/proto-ui.jsx` and becomes the token value. **The prototype
wins every conflict** with current token values.

Deliverable beyond the CSS: a written **style→token mapping table**
(`docs/superpowers/specs/2026-07-03-unit-10-style-token-map.md`) mapping each
skin field / recurring inline-style cluster to its token utility (e.g.
`skin.card` → `bg-panel border-hairline rounded-r-3`). All later phases
consult this table. A style with no mapping is a stop-the-line event: extend
the table; never approximate inline.

`scripts/check-tokens.sh` remains the guard and must pass throughout.

## 5. Kit port (Phase 1)

Port into `src/ui/kit/`, typed, one file per primitive, props mirroring the
prototype's, rendering mapped through the token table:

- From `proto-ui.jsx`: `PHeader`, `PTabBar`, `PCard`, `PSectionLabel`, `PRow`,
  `PButton`, `PToggle`, `PField`, `PQR`, `Body`, the `tapBtn` pressed-state
  helper.
- From `hf-kit.jsx`: `HAv` (avatar incl. group/ring variants), `Icon` + the
  full `IPATHS` icon set, `ArcanMark`.
- From `proto.jsx`: `Fab`, `Toast`, `Bubble`/`Row` chat primitives,
  `MobileShell` (from `MobileApp` chrome), `DesktopWindow`, `DesktopEmpty`,
  `AuthShell`.
- `Lattice`: the kit phase pixel-gates the existing `src/components/lattice`
  against the prototype's `ArcanMark`; keep it if it passes, re-port if not.

**Gate:** a bare harness page renders each kit component next to its prototype
twin in isolation; pixel-diff must pass (per-pixel threshold, see §6) —
including hover / pressed / disabled / active states, driven by Playwright —
before Phase 1 exits. Edges die here, before screens multiply them.

## 6. Parity harness

Throwaway Playwright harness in `tests/parity/`; never wired into CI; report
output gitignored.

- **Prototype side:** serve `design/` statically; drive the real prototype
  (`Arcan Prototype.html` → `proto.jsx`) to each screen via its own nav/state;
  screenshot the frame content box (phone 300×600 CSS px, desktop 940×600 —
  crop the stage chrome away).
- **App side:** because presenters are pure (§7), render each presenter
  directly with a fixture mirroring the prototype's `SEED` data, inside a
  stage sized to the same frame, toggling theme class and accent attribute.
  **No Jazz, no sync server, no seeded accounts.**
- **Comparison:** `pixelmatch` with a small per-pixel threshold (both sides
  render in the same Playwright Chromium with the same font files, so AA noise
  is low). Output per screen × {mobile, desktop} × {dark, light}: prototype |
  app | diff triptych in a report folder.
- **Pass criterion:** remaining diff pixels are attributable only to
  sanctioned deviations (§8). Ambiguous diffs are triaged by Claude and
  surfaced to the user.
- **Scope:** the harness gates Rung-1 screens and Phase-1 primitives. Rung-2/3
  screens get a side-by-side still comparison in the same report (reference
  image rendered from the hf-/wf- artifact). Rung 4 is judgment + user review
  of the coverage manifest.

## 7. Container / presenter contract

**Presenters** (`src/ui/screens/`, one per screen) are pure: props in, JSX
out. No Jazz imports, no router imports; navigation and actions arrive as
callback props (`onOpenChat(id)`, `onBack()`). Purity is mechanically
enforced by a guard script (same spirit as `check-tokens`) that rejects
`@/jazz`, `jazz-tools`, and `react-router` imports under `src/ui/`.

**Containers** are today's route files, shrunk: they keep their existing
`useAccount` resolve specs, handlers, effects (invite replay, polling, inbox
wiring), and render the presenter with a typed **view-model** whose shape is
dictated by what the prototype screen consumes (e.g. the chats list presenter
takes `Array<{id, name, initials, preview, time, unread, isGroup}>` — exactly
what `ChatsScreen` reads from its seed). Existing, tested data logic is
*moved*, not rewritten, wherever possible.

Known cost: view-model mapping is where bugs can hide (correct pixels with
fixture data, wrong data live). Containers' correctness is covered by the
retargeted e2e suite (Phase 4), not by the parity harness.

## 8. Transliteration rules

1. **Tree copies exactly.** Element sequence, nesting, and ordering copy
   node-for-node. No "equivalent" restructuring.
2. **Styles go through the mapping table** (§4). No inline approximations.
3. **Copy transfers verbatim** — labels, casing, empty-state text, icon
   choices. Seed-derived text is replaced by props; its *formatting* still
   copies (via `src/ui/format.ts`).
4. **Interactive states copy** — hover, pressed (`tapBtn`), disabled,
   active-tab; transition/motion literals copy.
5. **Sanctioned deviations — all others are defects:**
   a. Dropped features: presence dots, typing indicator, delivery ticks
      (NOX-31/32/33) are omitted at the tree level, not hidden.
   b. Non-visual a11y additions (aria-*, sr-only, focus-visible styling).
   c. `data-testid` attributes.
   d. Real-data states the design doesn't show (loading / error / empty),
      built from the kit and logged in the coverage manifest.

## 9. Screen inventory — the fidelity ladder

Every app surface is assigned a **source rung** before porting starts. Where a
screen exists on multiple rungs, the lower rung number wins (standing ruling:
`proto.jsx` is canonical over hi-fi stills).

**Rung 1 — `proto.jsx` (interactive, canonical):** home lists (chats /
contacts + desktop empty pane + both shells), ChatScreen, ConvoSettings (→ the
`/conversations/:id/members` surface), NewConvo, AddPeople, AddContact,
contact Profile, OwnProfile, Settings, Feedback, LinkDevice, Welcome, SignIn,
Toast, Fab, AuthShell.

**Rung 2 — `hf-flows.jsx` / `hf-extra.jsx` (hi-fi stills, same skin):**
onboarding Credentials → passphrase Confirm → ProfileSetup; Recovery +
Restore; pairing **ApproveDevice** gate; **ContactRequest** (→ `/invite`
accept screen).

**Rung 3 — `wf-missing.jsx` (wireframes: structure only, skin from the
kit):** ChangePassword, password-gated ViewRecoveryCode flow, destructive
confirm patterns (adapted to the routes-not-modals decision), recovery
confirm variants.

**Rung 4 — kit inference:** `/connections/pending`,
`/connections/live-invites`, notifications surface, inviter-side QR pop-up
overlay, image lightbox, media in bubbles/composer, system-event rows in
chat, and all loading / error / empty states the design doesn't show.
Inference from the kit is the **last** resort; check Rungs 2–3 artifacts
first.

### Coverage manifest

A living document
(`docs/superpowers/specs/2026-07-03-unit-10-coverage-manifest.md`) with one
row per app surface: **surface, route, source rung, reference artifact,
parity status, inference notes** (mandatory prose for Rung 3–4 rows: what was
inferred and from which kit pieces). The manifest is the user's review
artifact at the end of Phase 3 and again at final sign-off — it reports for
*every* screen which rung covered it, not only the inferred ones.

Standing content rules across all rungs: presence/typing/delivery visuals are
omitted, not ported; prototype seed data is replaced by real data seams,
never hard-coded.

## 10. Execution phases

Each phase — and each wave within Phase 2 — merges to main `--no-ff`
(Unit 10 sub-merges, no tags). The app stays runnable throughout — screens swap one at a time; a mixed skin
mid-migration is expected and acceptable at this stage.

- **Phase 0 — Tokens + mapping table** (§4). Small, sequential, foundational.
- **Phase 1 — Kit port + primitive harness** (§5, §6).
- **Phase 2 — Screen transliteration in four waves.** Each wave = parallel
  subagent tasks in worktrees; one screen = one task = presenter + container
  + fixture + parity pass. Waves:
  - **A:** shell integration + home — the app shell adopts the kit's
    MobileShell / DesktopWindow / DesktopEmpty; ChatsScreen and ContactsScreen
    presenters + containers; Fab and Toast wired in (all four shells/chrome
    pieces are *built* in Phase 1; this wave integrates them)
  - **B:** chat surface (ChatScreen: rows, bubbles, composer, day markers;
    system-event rows and media as flagged Rung-4 insertions)
  - **C:** settings cluster (Settings, Feedback, LinkDevice, OwnProfile,
    ContactProfile, ConvoSettings, NewConvo, AddPeople, AddContact)
  - **D:** auth + flows (Welcome, SignIn, onboarding steps, Recovery /
    Restore, ApproveDevice, ContactRequest → `/invite`, pairing)
- **Phase 3 — Rung-4 surfaces + coverage manifest** (§9). User reviews the
  manifest at phase exit.
- **Phase 4 — Cleanup + tests.** Delete superseded `src/components/` files
  and unused shadcn primitives; purity + token guards enforced repo-wide;
  unit suite reconciled (component-render tests retarget to presenters —
  simpler, pure props; `src/jazz` logic tests untouched); e2e suite
  retargeted **once**, back to green (baseline 44/44 chromium at `e3eda51`);
  CLAUDE.md conventions updated (kit usage, `src/ui` purity rule).
- **Phase 5 — Final user walkthrough** against the parity report + coverage
  manifest.

**Worktree discipline (Unit 8/9 lessons):** every subagent verifies its base
is current `main` before starting (`git reset --hard main` if stale);
plan-writing agents write files only, never touch git; parallel screen tasks
are file-disjoint by construction (one screen's presenter + container each).

## 11. Testing summary

- **Pixels:** parity harness (§6) — primitives in Phase 1, Rung-1 screens in
  Phase 2, stills comparison for Rungs 2–3. Throwaway; not CI.
- **Presenters:** plain Vitest render tests with fixture props where useful
  (cheap, no Jazz mocking).
- **Containers / flows:** existing e2e suite, retargeted once in Phase 4.
- **Guards:** `check-tokens` + the new `src/ui` purity guard, pre-commit.

## 12. Risks and costs

- **Scale:** the biggest unit yet — roughly Unit 8 + Unit 9 combined. Accepted
  because it retires the recurring "match the design" task type entirely.
- **View-model mapping bugs** (§7): mitigated by moving existing tested logic
  and by the e2e retarget.
- **Prototype quirks:** `proto.jsx` uses window globals and Babel-standalone;
  the harness drives it as-is rather than rebuilding it. If a prototype
  screen has a rendering bug, the prototype still wins (fidelity first);
  genuine bugs are flagged to the user in the manifest instead of silently
  "fixed".
- **Responsive middle ground:** the prototype defines exactly two frames
  (phone / desktop). Behavior between those widths follows current app
  breakpoints and is logged as a Rung-4 manifest row.
- **Mixed skin during migration** is accepted (dev-stage app, destructive
  resets allowed).
