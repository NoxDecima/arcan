# Arcan

A local-first, end-to-end-encrypted messenger for small trust circles. Built on Jazz/CoJSON.

## Status

E1a Slices 1 and 2 are complete and merged to `main` (tags `slice-1-complete`, `slice-2-complete`). See `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md` for the full design and `docs/superpowers/plans/` for slice-by-slice implementation plans.

## Issue tracking

Followups, design decisions, and known limitations are tracked in Linear:

- **Team:** Nox
- **Project:** Arcan (<https://linear.app/nox-decima/project/arcan-c718904b5ef5>) — renamed from "jazz-messanger" 2026-06-05; the app rebrand itself is tracked as Unit 5 of the 2026-06-05 UI-rework spec.

Items captured via the `followup-tracking` skill during development persist there automatically.

## Development

Requires Node 22+.

```bash
npm install
npm run sync     # in one terminal — local sync server on :4200
npm run dev      # in another — Vite dev server on :5173
```

Tests:

```bash
npm test                  # unit tests via Vitest
npm run test:e2e          # end-to-end tests via Playwright (requires browser binaries installed)
```

To install Playwright browsers (one-time):

```bash
npx playwright install chromium firefox
```

## Documents

- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans
- `docs/security/threat-model.md` — security threat model
- `docs/jazz-api-notes.md` — jazz-tools 0.20.18 API reference
- `CLAUDE.md` — repo-level project memory consumed by Claude Code sessions
