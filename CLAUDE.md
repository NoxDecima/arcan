# jazz-messanger — project memory for Claude Code

This file is loaded into Claude Code's context for every session in this repo. Keep it tight and high-signal.

## What this project is

A local-first, end-to-end-encrypted messenger built on Jazz/CoJSON. Vision X: small trust circles (≤50-person groups), hard-block strangers, web-first PWA, self-hosted sync server.

Authoritative design: `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md`.
Threat model: `docs/security/threat-model.md`.
Jazz API surface in use: `docs/jazz-api-notes.md` (verified against jazz-tools 0.20.18; re-run the survey if the version changes).

## Status

- Slice 1 (foundation + account creation) — merged, tag `slice-1-complete`.
- Slice 2 (QR pairing + contact invitations) — merged, tag `slice-2-complete`.
- Slice 3 (conversations + messaging) — not yet started.

## Issue tracking

Linear: team=Nox project=jazz-messanger

(The `followup-tracking` skill resolves to this destination without prompting per the user's global instructions. URL: <https://linear.app/nox-decima/project/jazz-messanger-c718904b5ef5>.)

## Conventions

- TypeScript everywhere; strict; React 18; Tailwind v3 (not v4 — shadcn compat); shadcn/ui primitives in `src/components/ui/`.
- Schema files in `src/jazz/schema/` use PascalCase filenames matching the exported schema name (e.g. `JazzMessangerAccount.ts`).
- Jazz 0.20.18 uses a Zod-based functional API: `co.map({ field: z.string() })`, `co.list(X)`, `co.account({ profile, root })`. The plan documents from Slice 1 use older class-based syntax in places; always cross-check against the API notes.
- Tests: Vitest for unit (`tests/unit/`), Playwright for e2e (`tests/e2e/`). Vitest is scoped to `tests/unit/` only — don't put `.spec.ts` files there expecting them to run via vitest.
- Local dev requires running both `npm run sync` (Jazz sync server on `:4200`) and `npm run dev` (Vite on `:5173`).
- A nix shell at `shell.nix` provides Node 22 + Playwright browsers + system deps; enter with `nix-shell` for reproducible dev/test environment.

## Process

- Use the brainstorming → write-plan → subagent-driven-development workflow for each new slice.
- Slice boundaries are tagged (`slice-N-complete`); each slice merges to main as a `--no-ff` merge commit so the slice structure stays visible in git log.
