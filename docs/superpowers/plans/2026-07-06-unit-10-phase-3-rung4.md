# Unit 10 Phase 3 — Remaining Rung-4 Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Compact plan — one restyle batch + manifest completion; all Unit 10 conventions (mapping table, purity, testid carry-over, route-root scroll rule, user decisions) apply as in the wave plans.

**Goal:** The last legacy-skinned surfaces render through the kit; the coverage manifest is complete and ready for user review; no proto reference exists for any of these (pure Rung 4 — kit-idiom inference, logged).

**Branch:** `unit-10/phase-3-rung4` off main; merge `--no-ff`.

### Task 1: Restyle batch (one task, five surfaces)

All are inference-from-kit; keep EVERY handler/flow/testid; restyle markup only.

- [ ] `src/routes/connections/pending.tsx` — kit PCard/PRow-idiom list (HAv initials, name `text-ui-contact`, meta `text-ui-sub text-dim`), PButton approve (primary) / dismiss (outline); route root `flex-1 min-h-0 overflow-y-auto` with `w-full max-w-[600px] mx-auto` content cap; empty state = auth-flow-idiom centered dim text (NOT EmptyPane); keep `pending-*` testids + flows (approve/dismiss via invitations.ts).
- [ ] `src/routes/connections/live-invites.tsx` — same treatment: PCard rows (channel/TTL meta), PButton revoke (danger outline); keep `live-invite-*` testids + revokeInvitation flow; same root/cap/empty rules.
- [ ] `src/components/pending-requests-section.tsx` — the contacts-tab slot: compact kit rows (HAv + name + `text-ui-sub` meta + small PButton approve / MuteLink-style dismiss), PSectionLabel "pending" header; keep testids; must look at home inside NavColumn/ContactsScreen.
- [ ] `src/components/incoming-connection-prompt.tsx` — sanctioned overlay (Unit 9 decision): keep ModalShell mounting/behavior; innards → kit (HAv, AuthTitle-idiom name, `text-ui-sub` fingerprint hint, PButton accept primary / dismiss outline); keep `incoming-*` testids.
- [ ] `src/components/image-lightbox.tsx` — sanctioned overlay: verify tokens (bg-black/N scrim allowed); swap any shadcn Button/ad-hoc classes for kit Icon close button (`tapClass`, Icon close, `image-lightbox-close` testid kept).
- [ ] No parity cells (no reference) — visual acceptance = the user's Phase-3 manifest review + screenshots in the report.
- [ ] Gates: typecheck, check-tokens, check-ui-purity, vitest, FULL parity (untouched cells), e2e subset: connection-request-delivery, contact-invitation, attachment-image (lightbox), unread-badges.
- [ ] Commit: `feat(rung4): pending/live-invites/prompt/lightbox restyled through the kit (Phase 3)`

### Task 2: Manifest completion + exit

- [ ] Add manifest rows for the five surfaces (Rung 4, "kit-idiom inference, no reference — user review pending").
- [ ] Sweep the manifest for stale statements; ensure every override/decision/deviation section is current. This document is the user's Phase-3 review artifact.
- [ ] Battery + merge `--no-ff`: `Unit 10 Phase 3: remaining Rung-4 surfaces + manifest`.
