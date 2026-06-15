# Unit 8 — Final UI alignment sweep — Design Spec

> Companion to `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md` § Unit 8.
> This document defines the methodology; the audit doc + per-sub-unit plans encode the work itself.

**Goal.** Close the visual drift between the live app (post-Units 1, 2, 3-follow-up, 4) and the
ArcanUI hi-fi designs, ending in a state where every implemented surface matches the design
language and nothing the design specifies is silently missing.

**Method.** A three-phase loop: capture-then-audit (A) → primitive-first transitions in parallel
sub-units (B) → post-implementation re-audit (C) → cleanup + tag.

**Tech.** Playwright (one-shot capture only — no persistent regression suite), the existing
design tokens / Lattice / Skeleton / Toast primitives from Unit 7, the existing routes from
Units 1/2/3/4, and the design references in `ArcanUI.zip`.

---

## Background

Unit 7 shipped the foundation (tokens, fonts, theme + accent, Lattice, toast + skeleton, lint
guard). Units 1/2/4 + the Unit 3 follow-up each redrew their feature surfaces. But each unit was
scoped to its own feature — none of them owned cross-cutting patterns the design specifies
(cosmic `AuthSurface` shell, `EmptyPane` watermark, formalised modal shells, mobile chrome,
sidebar separation choice, toast/skeleton wiring, top app header treatment).

The result: half the app reads as the hi-fi reference, half reads as "old layout with new
tokens". Unit 8 inventories that gap once and closes it before Unit 6 (Shape 3 / NOX-10) lands
its foundational schema rework.

---

## Reference assets

`ArcanUI.zip` extracts into `design/` (added to `.gitignore`). Layout once unpacked:

- `design/Jazz Hi-Fi App.html`, `design/Jazz Hi-Fi Chat.html` — full hi-fi reference renders
- `design/Arcan Prototype.html`, `design/proto.jsx`, `design/proto-ui.jsx` — the prototype
  (often a more current expression of interaction + layout intent than the stills)
- `design/hf-*.jsx` — JSX sources for individual scenes (chat, contacts, settings, convo-settings,
  list, flows, polish, kit, extra)
- `design/nox-tokens.css` — design-side token file. Diff against `src/styles/tokens.css` once;
  any drift becomes its own audit row.
- `design/screenshots/` — pre-rendered PNGs covering most scenes
- `design/brand/` — final SVG/PNG brand assets (lockups, marks, favicon, app icons)

`design/` is gitignored — the assets are local reference only, not part of the source tree. When
the design package iterates, replace `ArcanUI.zip` and re-extract.

---

## Phase A — Audit

### A.1 · Capture

A standalone Playwright script at `scripts/audit/capture-screens.ts`. Not a test — boots Vite +
sync + api in-process, navigates, screenshots, exits. Run once via `npm run audit:capture`.

**Viewports:** 1440×900 (desktop) and 375×812 (mobile). Every surface is captured at both
viewports, producing two PNGs per surface variant.

**Output:** `docs/superpowers/audit/unit-8/live/<surface-id>--<viewport>.png` + a manifest
`docs/superpowers/audit/unit-8/live/manifest.json` enumerating every captured surface with its
route, viewport, and seed state.

**Route enumeration is dynamic, not hardcoded.** The script:

1. Parses `src/App.tsx` for `<Route path=…>` entries → base list.
2. For each route, derives required state from the path shape:
   - `/conversations/:id` → seed a 1:1 conversation with N messages, and a group with M members
   - `/conversations/:id/members` → admin + non-admin variants
   - `/profile/:accountID` → self + other variants
   - `/connections/pending` → empty + non-empty variants
3. Detects modal/dialog surfaces by walking the rendered DOM for known triggers (camera-upload
   button, change-password CTA, group settings menu, IncomingConnectionPrompt, TrustedDevicePrompt,
   etc.) and firing each.
4. Emits the manifest with one entry per surface variant.

**Seed fixture.** A small `scripts/audit/seed.ts` resets app state to a deterministic snapshot
before capture: known accounts, known conversations + messages, known contacts. Re-runnable. The
deterministic seed is critical for diff-friendly re-captures during Phase C.

### A.2 · Reconcile

Three-way reconciliation against `design/`:

| Case | Status | Action |
|---|---|---|
| Design and live both present, visually match | `match` | row records the match; no Phase B work |
| Design and live both present, visually diverge | `partial` | row enumerates deltas |
| Design present, live missing | `gap` | row proposes the component/route to add |
| Live present, design missing | `unreferenced` | row proposes a **self-authored** adjustment derived from the design language (tokens + existing primitives) |

`unreferenced` rows additionally collect into a dedicated section at the end of the audit doc
(`## Unreferenced surfaces — self-authored adjustments`) so the user can scan/approve them
together before Phase B picks them up.

### A.3 · Audit doc

`docs/superpowers/specs/2026-06-13-unit-8-audit.md`. One row per surface variant. Schema:

```yaml
id: AUDIT-001
phase: A
route: /auth/login
viewport: desktop
status: partial          # match | partial | gap | unreferenced
live: live/login--desktop.png
reference:
  - design/Jazz Hi-Fi App.html#sign-in
  - design/Arcan Prototype.html#sign-in
  - design/hf-flows.jsx
  - design/screenshots/01-bs.png
deltas:
  - category: layout     # layout | spacing | typography | color | iconography | copy | motion
    severity: block      # block | fix | nit | defer
    description: missing cosmic AuthSurface backdrop (Lattice + scattered dots)
    source: prototype + hi-fi (agree)
  - category: layout
    severity: fix
    description: card width 360px vs ~300px in references
    source: hi-fi
proposed_action: shared AuthSurface primitive → sub-unit 8a
proposed_action_self_authored: null   # populated only when status: unreferenced
```

**Severity meanings:**
- `block` — visually wrong / missing primitive / breaks the design's intent. Must fix.
- `fix` — measurable drift (wrong padding, wrong type ramp, wrong icon). Should fix.
- `nit` — small polish (1–2px adjustment, copy tweak). Nice to have.
- `defer` — known divergence we accept (e.g. mobile-chrome-only items, items blocked on Unit 6).

**Category meanings** define what the delta touches; they drive which primitive owns the fix and
therefore which Phase B sub-unit absorbs it.

I produce the first pass — capture, walk every row, populate deltas and proposed actions. The
user reviews the doc and edits any row before Phase B planning starts.

**Audit gate:** Phase B planning does not start until the user approves the Phase A audit doc.

---

## Phase B — Transitions (parallel sub-units)

Six sub-units. 8a–8e are designed to run **concurrently** in worktrees — each owns either a
specific primitive or a self-contained cross-cutting concern with no shared files. 8f waits for
8a/8b/8c because it consumes their primitives, but its work-list is known from Phase A.

Each sub-unit gets its own implementation plan at
`docs/superpowers/plans/2026-06-13-unit-8<letter>-<slug>.md`, written via the `writing-plans`
skill once the audit gate passes.

| Sub-unit | Owns | Touches | Depends on |
|---|---|---|---|
| **8a · AuthSurface** | new `src/components/auth-surface.tsx`: cosmic Lattice watermark + scattered dots + centered narrow card shell | 9 auth/onboarding/recovery routes + Unit 2's responder screens | nothing |
| **8b · EmptyPane + Lattice placement** | new `src/components/empty-pane.tsx`: oversized Lattice + cosmic backdrop for desktop reading-pane empty states; finalize Lattice placement in app header | conversations empty state, contacts empty state, app header | nothing |
| **8c · Modal shell** | new `src/components/modal-shell.tsx`: canonical scrim + Card + hairline header + action footer | change-password, view-recovery-code, leave-with-promote, group-create, contact-picker, image-lightbox, IncomingConnectionPrompt, TrustedDevicePrompt | nothing |
| **8d · Mobile chrome + sidebar separation** | safe-area insets, status-bar transparency hints, finalize sidebar separation pick from the design's `SidebarOptions` | App.tsx, sidebar.tsx, mobile-tab-bar.tsx | nothing |
| **8e · Toast + skeleton call-sites** | wire `useToast()` where actions still use inline status messages; replace `"Loading…"` with skeleton primitives | many small touch-points across routes — bulk grep-and-wire work | nothing |
| **8f · Unreferenced surfaces** | apply self-authored adjustments approved in Phase A | whichever surfaces 8a/8b/8c didn't already touch | 8a, 8b, 8c |

**Parallelism story.** 8a–8e have zero file overlap by construction:
- 8a owns one new file + edits to the 9 auth-flow routes
- 8b owns one new file + the conversations/contacts empty-pane render + app-header
- 8c owns one new file + the modal-using surfaces
- 8d owns layout shell files (App.tsx, sidebar, mobile-tab-bar)
- 8e owns dozens of small call-site edits across routes, no new components

The risk of overlap is 8a's auth-route edits vs 8e's toast wiring on those same routes — handled
by 8e adopting `AuthSurface` from main once 8a merges and reviewing its auth-route call-sites
post-merge.

8f cannot start until 8a/8b/8c have merged (it consumes their components) but its plan is
written and committed up-front, so execution begins immediately on merge of the dependency set.

### Per-sub-unit verification

Each sub-unit, before marking ready-to-merge:

1. `npm run check-tokens` — token guard from Unit 7
2. `npx tsc -b --noEmit`
3. `npx vitest run`
4. Re-capture the affected routes with `scripts/audit/capture-screens.ts`; drop the new shots
   into the audit doc; mark the corresponding rows ✅
5. Manual visual walk of the touched surfaces

Each sub-unit ships as a `--no-ff` merge commit to `main` (matching the Unit 1/2/3/4 cadence) so
the sub-unit boundary stays visible in git log.

### Cadence

Phase B execution mirrors the Unit 1/2/3/4 batch: launch 8a–8e as concurrent subagents in
separate worktrees (each on its own branch off main), review each result, merge in any order.
Once 8a/8b/8c are on main, launch 8f.

---

## Phase C — Post-implementation audit

After 8a–8f all merge, re-run `scripts/audit/capture-screens.ts` against main. Produce
`docs/superpowers/specs/2026-06-13-unit-8-post-audit.md` with the same schema as Phase A. Each
row from Phase A is revisited and three new outcomes are possible:

| Outcome | Meaning |
|---|---|
| `closed` | Phase B fixed it; ✅ |
| `regressed` | Phase B introduced new drift on this surface; new delta entries added |
| `new` | Phase A missed this surface — typically a sibling component a sub-unit refactor exposed |

I do the first-pass eval again; user reviews. Triage rule:
- Tiny tactical fixes → a single cleanup commit on `main`
- Anything substantial → a focused **Unit 8g** sub-unit, planned + executed the same way

The post-audit doc is the single source of truth for "is Unit 8 done." Every row must be either
`closed` or moved to an explicitly-scoped follow-up issue before tagging `slice-8-complete`.

---

## Phase D — Cleanup + tag

Mechanical:

1. Revert the visual-regression infra stubs added during brainstorming
   (`playwright.visual.config.ts`, `tests/visual/`, `test:visual` + `test:visual:update` npm
   scripts). These were premature — Phase A/C use the one-shot capture script, not a persistent
   test suite. Capture script and audit docs stay.
2. Confirm `design/` is in `.gitignore`. ArcanUI.zip itself stays in the repo for future
   re-extraction.
3. Update `CLAUDE.md` status section: Unit 8 shipped; next is Unit 6 (Shape 3 / NOX-10).
4. Tag `slice-8-complete` on `main`.

---

## Out of scope for Unit 8

- New features (each belongs to its own unit).
- Anything that requires backend or schema changes (Units 1/2/4 territory).
- NOX-31 (presence) / NOX-32 (typing) / NOX-33 (delivery states) — deferred per 2026-06-08
  decision.
- Persistent visual regression test suite — explicit decision: once-only audit, no CI gate.
  Drift prevention going forward leans on the existing `check-tokens` guard plus code review
  discipline. Revisit if drift accumulates again.
- Unit 6's UI surfaces (Settings → Devices revocation flow, per-device-account pairing
  rewrite) — those land with Unit 6 and may need a smaller second alignment pass after.

---

## Deliverables

- `design/` — extracted reference assets (gitignored)
- `scripts/audit/capture-screens.ts` + `scripts/audit/seed.ts` — capture infrastructure
- `npm run audit:capture` — package.json script
- `docs/superpowers/audit/unit-8/live/` — captured PNGs + manifest. Committed (gitignoring
  them would break inline rendering of the audit doc and lose the historical record of what
  shipped each phase).
- `docs/superpowers/specs/2026-06-13-unit-8-audit.md` — Phase A audit
- `docs/superpowers/plans/2026-06-13-unit-8a-auth-surface.md`
- `docs/superpowers/plans/2026-06-13-unit-8b-empty-pane.md`
- `docs/superpowers/plans/2026-06-13-unit-8c-modal-shell.md`
- `docs/superpowers/plans/2026-06-13-unit-8d-mobile-chrome.md`
- `docs/superpowers/plans/2026-06-13-unit-8e-toast-skeleton-wiring.md`
- `docs/superpowers/plans/2026-06-13-unit-8f-unreferenced-surfaces.md`
- Code transitions per plan
- `docs/superpowers/specs/2026-06-13-unit-8-post-audit.md` — Phase C audit
- `slice-8-complete` tag on `main`

---

## Workflow summary

1. Brainstorm finalised → this spec lands.
2. Phase A capture + first-pass audit → user review → audit gate.
3. `writing-plans` produces six per-sub-unit plans.
4. Phase B execution: 8a–8e in parallel worktrees, then 8f.
5. Phase C re-audit → close or scope follow-ups.
6. Phase D cleanup + tag.

Status-tracking single source of truth: the audit doc itself — every row gets a ✅ when its
sub-unit merges; every Phase C row resolves to `closed` or a follow-up before tagging.
