# Jazz Messanger

A local-first, end-to-end-encrypted messenger for small trust circles. Built on Jazz/CoJSON.

## Status

E1a Slice 1 — Foundation + Account Creation. See `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md` for the full design and `docs/superpowers/plans/2026-05-15-e1a-slice-1-foundation-account.md` for the implementation plan.

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
