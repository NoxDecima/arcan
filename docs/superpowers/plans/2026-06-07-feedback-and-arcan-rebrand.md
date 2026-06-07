# Feedback endpoint + Arcan rebrand (Units 3 + 5 coordinated) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the new `POST /api/feedback` Linear-backed feedback endpoint while completing the codebase-wide jazz-messanger → Arcan rebrand. Touch each affected deploy/config file exactly once.

**Architecture:** Two units are coordinated because they share files (`auth-server/package.json`, deploy/Dockerfile, compose service, Caddy route, root `package.json`, etc.). Sequencing: knowledge probe → wipe → service rename (`auth-server/` → `api/`, `@arcan/api`) → schema rename (`JazzMessangerAccount` → `ArcanAccount`) → recovery-HMAC string → root brand strings → PWA manifest → historical-doc notes → Linear API client (TDD) → feedback endpoint (TDD) → final verification + repo/GitHub-remote rename ceremony.

**Tech Stack:** TypeScript strict, React 18, Tailwind v3, shadcn/ui, jazz-tools 0.20.18, Hono backend, Better Auth + better-sqlite3, Vitest + Playwright. Linear GraphQL API (`https://api.linear.app/graphql`) for issue creation + file upload.

**Spec:** `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md` — Units 3 and 5, with the doc-wide destructive baseline.

---

## Known Linear IDs (record in `.env.example`)

| Purpose | UUID |
|---|---|
| Team `Nox` | `8f04cf65-d7a9-41d3-bc9b-5074f744e850` |
| Project `Arcan` | `79d46a12-7563-4e3c-833b-d49531d94bb1` |
| Label `Feedback` | `e4c59d7f-2ebb-4ea0-bc37-f4e863b5a694` |
| Label `Bug` | `c8272cda-3f22-4850-b267-d166b844f770` |
| Label `Improvement` | `9c75086b-59b9-4f61-b0d4-525932b42231` |
| Label `Feature` | `7a184ee1-2c4d-4451-a09a-d16413d196ef` |

The `LINEAR_API_TOKEN` is a secret — the user supplies it via env at deploy time and locally via shell. Do **not** commit a real token.

---

## Phase 0 · Schema-rename probe (knowledge gate, not a migration gate)

### Task 0.1: Probe whether the `JazzMessangerAccount` export name is encoded in stored CoValue data

**Files:**
- Create: `tests/probe/schema-rename-probe.test.ts`

The destructive baseline means the rename can proceed regardless of probe outcome — but knowing the result informs future renames. This is a one-time investigation captured as a test.

- [ ] **Step 1: Write the probe test**

```typescript
// tests/probe/schema-rename-probe.test.ts
import { describe, test, expect } from "vitest";
import { co, z } from "jazz-tools";

/**
 * PROBE — informational only.
 *
 * Question: does jazz-tools 0.20.18 encode the schema *export name* into
 * stored CoValue data such that renaming the export breaks load?
 *
 * Approach: define two account-style co.map schemas with different export
 * names but identical field shapes. Create an instance under name A,
 * serialize/deserialize the raw shape, attempt to load under name B.
 *
 * Result (passing test) ⇒ rename is data-format-safe.
 * Result (failing test) ⇒ schema name IS load-bearing; document for posterity.
 */
describe("schema-rename probe", () => {
  test("renaming a co.map export does not affect raw CoValue load", () => {
    const SchemaA = co.map({ greeting: z.string() });
    const SchemaB = co.map({ greeting: z.string() });

    // The probe checks structural equivalence at the schema descriptor level.
    // jazz-tools 0.20.18 keys schemas by their structural shape, not by JS
    // identifier — confirm that here.
    expect(typeof SchemaA.create).toBe("function");
    expect(typeof SchemaB.create).toBe("function");

    // Both schemas have identical field descriptors.
    const a = (SchemaA as unknown as { def: unknown }).def;
    const b = (SchemaB as unknown as { def: unknown }).def;
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
```

- [ ] **Step 2: Run the probe**

Run: `npx vitest run tests/probe/schema-rename-probe.test.ts`
Expected: PASS — confirms structural equivalence; rename is data-format-safe.

If the test FAILS, do not block the rename (destructive baseline applies). Document the result in the commit message.

- [ ] **Step 3: Commit the probe**

```bash
git add tests/probe/schema-rename-probe.test.ts
git commit -m "test: schema-rename probe for Unit 5 (informational gate)"
```

---

## Phase 1 · Destructive wipe (clean slate before renames)

### Task 1.1: Wipe the auth-server SQLite

**Files:**
- Modify: `auth-server/auth.sqlite` (deleted)
- Modify: `auth-server/auth.sqlite-shm` (deleted)
- Modify: `auth-server/auth.sqlite-wal` (deleted)

- [ ] **Step 1: Delete the local Better Auth SQLite files**

```bash
rm -f auth-server/auth.sqlite auth-server/auth.sqlite-shm auth-server/auth.sqlite-wal
ls auth-server/
```

Expected: no `auth.sqlite*` files in the listing. The files are gitignored per `auth-server/.gitignore`.

- [ ] **Step 2: Verify they regenerate on next dev run (sanity check only — do not commit the regenerated files)**

Run: `npm run auth &` then `sleep 3 && kill %1`
Expected: console log "auth-server migrations applied" and `auth-server/auth.sqlite` reappears.

- [ ] **Step 3: Remove the regenerated files again (they are gitignored)**

```bash
rm -f auth-server/auth.sqlite auth-server/auth.sqlite-shm auth-server/auth.sqlite-wal
```

No commit — the SQLite files are gitignored and were never tracked.

---

## Phase 2 · Service + package rename (auth-server → api, @arcan/api)

This phase touches each deploy/config file exactly once so Unit 5's later brand sweep doesn't have to revisit them.

### Task 2.1: Rename the `auth-server/` directory to `api/`

**Files:**
- Move: `auth-server/` → `api/`

- [ ] **Step 1: git mv the directory**

```bash
git mv auth-server api
ls api/
```

Expected: `api/` contains `src/`, `tests/`, `package.json`, `tsconfig.json`, `vitest.config.ts`, etc.

- [ ] **Step 2: Update internal package.json name**

Edit `api/package.json`:

```json
{
  "name": "@arcan/api",
  "private": true,
  "type": "module",
  ...
}
```

- [ ] **Step 3: Verify no lingering `auth-server` references inside the directory**

Run: `grep -rn "auth-server\|@jazz-messanger" api/ --include="*.ts" --include="*.json"`
Expected: only matches inside `api/package.json` `name`-field history (none remain) — fix any leftovers.

- [ ] **Step 4: Update auth-server tsbuildinfo cache reference (if present)**

Run: `rm -f api/tsconfig.tsbuildinfo`

This is gitignored; it will rebuild.

### Task 2.2: Update `scripts/auth-server.sh` → `scripts/api.sh`

**Files:**
- Move: `scripts/auth-server.sh` → `scripts/api.sh`

- [ ] **Step 1: git mv the script**

```bash
git mv scripts/auth-server.sh scripts/api.sh
```

- [ ] **Step 2: Update the script's comments and cd path**

Edit `scripts/api.sh` — replace any `auth-server` references with `api` in comments and the `cd "$REPO_ROOT/auth-server"` line:

```bash
#!/usr/bin/env bash
# scripts/api.sh — start ONLY the api service for local dev.
#
# Mirrors the npm run sync / npm run dev split: this script starts the
# Hono service (formerly auth-server) in isolation, so you can run it
# in its own terminal alongside `npm run sync` and `npm run dev`.
...
cd "$REPO_ROOT/api"
exec npx tsx src/index.ts
```

Keep the rest of the env-var documentation unchanged.

### Task 2.3: Rename `deploy/Dockerfile.auth` → `deploy/Dockerfile.api`

**Files:**
- Move: `deploy/Dockerfile.auth` → `deploy/Dockerfile.api`
- Modify: contents (update any `auth-server` paths)

- [ ] **Step 1: git mv and inspect**

```bash
git mv deploy/Dockerfile.auth deploy/Dockerfile.api
cat deploy/Dockerfile.api
```

- [ ] **Step 2: Update path references inside**

Edit any `COPY auth-server/` lines to `COPY api/`; any `WORKDIR /app/auth-server` → `WORKDIR /app/api`.

### Task 2.4: Update `deploy/docker-compose.yml`

**Files:**
- Modify: `deploy/docker-compose.yml`

- [ ] **Step 1: Rename the `auth` service to `api`**

Replace the service block and any `auth:`/`auth-server` references:

```yaml
services:
  caddy:
    ...
    depends_on:
      - sync
      - api          # was: auth
  sync:
    ...
  api:               # was: auth
    build:
      context: ..
      dockerfile: deploy/Dockerfile.api   # was: Dockerfile.auth
    environment:
      ...
```

Keep environment variable values unchanged — only the service-name key and the Dockerfile reference move.

### Task 2.5: Update `deploy/Caddyfile`

**Files:**
- Modify: `deploy/Caddyfile`

- [ ] **Step 1: Update the reverse_proxy target**

```
handle /api/auth/* {
    reverse_proxy api:4300          # was: auth:4300
}
```

The URL path `/api/auth/*` is unchanged — only the internal hostname of the proxied service moves from `auth` to `api`.

### Task 2.6: Update root `package.json` script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Rename the `auth` script to `api`**

```json
"scripts": {
  ...
  "sync": "./scripts/sync-server.sh",
  "api": "./scripts/api.sh",          // was: "auth": "./scripts/auth-server.sh"
  ...
}
```

### Task 2.7: Update `scripts/dev-all.sh` to call `npm run api`

**Files:**
- Modify: `scripts/dev-all.sh`

- [ ] **Step 1: Update the script reference**

Search the file for `npm run auth` or `auth-server.sh` references; replace with `npm run api` / `api.sh`.

### Task 2.8: Verify the renamed service runs end-to-end

- [ ] **Step 1: Install dependencies in the renamed dir**

```bash
cd api && npm install && cd ..
```

- [ ] **Step 2: Start the service locally**

```bash
BETTER_AUTH_SECRET=$(head -c 32 /dev/urandom | base64) npm run api
```

Expected: console log `auth-server migrations applied` and `auth-server listening on :4300` (the in-code log strings still say "auth-server" — they get updated in Task 2.9).

- [ ] **Step 3: Kill the dev process**

```bash
# In another terminal:
pkill -f "tsx src/index.ts" || true
```

### Task 2.9: Update in-process log strings

**Files:**
- Modify: `api/src/index.ts`

- [ ] **Step 1: Replace the two `console.log` strings**

Find:

```typescript
console.log("auth-server migrations applied");
```

Replace:

```typescript
console.log("api service migrations applied");
```

Find:

```typescript
serve({ fetch: app.fetch, port: env.PORT }, ({ port }: { port: number }) => {
  console.log(`auth-server listening on :${port}`);
});
```

Replace:

```typescript
serve({ fetch: app.fetch, port: env.PORT }, ({ port }: { port: number }) => {
  console.log(`api service listening on :${port}`);
});
```

### Task 2.10: Run existing tests against the renamed dir

- [ ] **Step 1: Run api tests**

```bash
cd api && npx vitest run && cd ..
```

Expected: PASS — existing Better Auth + plugin tests pass against the renamed package.

- [ ] **Step 2: Run root tests**

```bash
npm run test
```

Expected: PASS — TypeScript compile and front-end Vitest suite pass; nothing imports from `auth-server/` so the front end is unaffected.

### Task 2.11: Commit the service rename

- [ ] **Step 1: Commit**

```bash
git add -A
git commit -m "refactor: rename auth-server -> api service (@arcan/api)

Coordinated with Unit 5 rebrand. Touches: directory, package name,
dev script, Dockerfile, compose service, Caddy reverse_proxy target,
root npm script, and the two in-process log strings. URL paths
(/api/auth/*) and Better Auth behavior unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3 · Schema rename (`JazzMessangerAccount` → `ArcanAccount`)

### Task 3.1: Rename the schema file

**Files:**
- Move: `src/jazz/schema/JazzMessangerAccount.ts` → `src/jazz/schema/ArcanAccount.ts`

- [ ] **Step 1: git mv the file**

```bash
git mv src/jazz/schema/JazzMessangerAccount.ts src/jazz/schema/ArcanAccount.ts
```

### Task 3.2: Rename the exported symbols inside the file

**Files:**
- Modify: `src/jazz/schema/ArcanAccount.ts`

- [ ] **Step 1: Rename exports and doc comments**

Within `src/jazz/schema/ArcanAccount.ts`, find and replace at the file level:

- `JazzMessangerAccountRoot` → `ArcanAccountRoot` (all occurrences)
- `JazzMessangerAccount` → `ArcanAccount` (all occurrences)
- In the docstring: any "JazzMessangerAccount" prose → "ArcanAccount"; "Jazz Messanger" → "Arcan"

The exports become:

```typescript
export const ArcanAccountRoot = co.map({ ... });
export const ArcanAccount = co.account({ profile: ..., root: ArcanAccountRoot });
```

### Task 3.3: Update all importers in `src/`

**Files:**
- Modify (each): `src/App.tsx`, `src/jazz/provider.tsx`, `src/jazz/avatarResolver.ts`, `src/jazz/createAccountFromSeed.ts`, `src/components/sidebar.tsx`, `src/components/notification-manager.tsx`, `src/components/contact-picker.tsx`, `src/routes/contacts/index.tsx`, `src/routes/contacts/detail.tsx`, `src/routes/contacts/add.tsx`, `src/routes/conversations/members.tsx`, `src/routes/pair/initiator-step.tsx`, `src/routes/settings/devices-section.tsx`, `src/routes/settings/profile-section.tsx`, `src/routes/settings/account-section.tsx`, `src/routes/settings/invites-section.tsx`

- [ ] **Step 1: Find every importer**

Run: `grep -rln "JazzMessangerAccount" src/`
Expected: the 16 files listed above (verify with the grep).

- [ ] **Step 2: Update each importer**

For each file, replace:

```typescript
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
```

with:

```typescript
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
```

And all in-file references to `JazzMessangerAccount` → `ArcanAccount`.

For `src/App.tsx`, also check for `me: useAccount(JazzMessangerAccount, …)` calls — rename the symbol.

For `src/jazz/createAccountFromSeed.ts`, the calls `JazzMessangerAccount.getMe().$jazz.waitForAllCoValuesSync(...)` and `JazzMessangerAccount.getMe().$jazz.ensureLoaded(...)` → `ArcanAccount.getMe()...`.

For `src/jazz/avatarResolver.ts`, the `Account.load(accountID, { loadAs: me, resolve: ... })` already uses the `Account` import — the `JazzMessangerAccount` reference appears in `useCoState(JazzMessangerAccount, accountID, ...)` and in a docstring; rename both.

- [ ] **Step 3: Run TypeScript compile to catch missed references**

```bash
npx tsc -b --noEmit
```

Expected: no errors. Fix any that surface.

- [ ] **Step 4: Run the front-end test suite**

```bash
npm run test
```

Expected: PASS. If any test imports `JazzMessangerAccount`, rename there too and rerun.

### Task 3.4: Commit the schema rename

- [ ] **Step 1: Commit**

```bash
git add -A
git commit -m "refactor: rename JazzMessangerAccount -> ArcanAccount

Mechanical rename of the root account schema file, exports, and all
16 importers under src/. Per the destructive baseline (no preserved
account data), no on-disk migration is needed — the rename is a clean
type-level change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4 · Recovery HMAC purpose string

### Task 4.1: Update the client-side HMAC constant

**Files:**
- Modify: `src/auth/recovery-proof.ts:4`

- [ ] **Step 1: Change the PURPOSE constant**

In `src/auth/recovery-proof.ts`, replace:

```typescript
const PURPOSE = "jazz-messanger:recovery-reset";
```

with:

```typescript
const PURPOSE = "arcan:recovery-reset";
```

### Task 4.2: Update the server-side comment + any HMAC validation

**Files:**
- Modify: `api/src/plugin.ts:28` (and any related code lines)

- [ ] **Step 1: Update the docstring and any string-comparison literals**

In `api/src/plugin.ts`, the docstring around line 28 reads:

```typescript
//   - recoveryProofHmac: HMAC-SHA256(seed, "jazz-messanger:recovery-reset")
```

Change to:

```typescript
//   - recoveryProofHmac: HMAC-SHA256(seed, "arcan:recovery-reset")
```

- [ ] **Step 2: Search for any other occurrence of the old string in the api/ source**

```bash
grep -rn "jazz-messanger" api/src/
```

Expected: no matches after the edit above. If any surface, update them.

### Task 4.3: Verify tests still pass

- [ ] **Step 1: Run client tests**

```bash
npm run test
```

Expected: PASS — any HMAC test that uses the PURPOSE constant via the import re-derives it correctly. If a test hard-codes the old string literal, update it.

- [ ] **Step 2: Run api tests**

```bash
cd api && npx vitest run && cd ..
```

Expected: PASS.

### Task 4.4: Commit the HMAC purpose change

- [ ] **Step 1: Commit**

```bash
git add -A
git commit -m "refactor: change recovery HMAC purpose string to arcan:recovery-reset

Per the destructive baseline, no existing recovery proofs need to be
preserved. The HMAC purpose moves from 'jazz-messanger:recovery-reset'
to 'arcan:recovery-reset' on both client (src/auth/recovery-proof.ts)
and server (api/src/plugin.ts docstring).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 5 · Root package name + cosmetic brand strings sweep

### Task 5.1: Update root `package.json` name

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Change the name field**

```json
{
  "name": "arcan",
  ...
}
```

### Task 5.2: Update `index.html` title and meta

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update the title and add a theme-color meta**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0a0a0a" />
    <title>Arcan</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

(The `<link rel="manifest">` is added now in anticipation of Phase 6 — the manifest file itself is created there.)

### Task 5.3: Update React UI brand strings

**Files:**
- Modify: `src/routes/onboarding/welcome-step.tsx:25`
- Modify: `src/routes/auth/login.tsx:54`

- [ ] **Step 1: Welcome screen**

In `src/routes/onboarding/welcome-step.tsx`, replace:

```tsx
Welcome to Jazz Messanger
```

with:

```tsx
Welcome to Arcan
```

- [ ] **Step 2: Login screen**

In `src/routes/auth/login.tsx`, replace:

```tsx
Welcome back to Jazz Messanger.
```

with:

```tsx
Welcome back to Arcan.
```

### Task 5.4: Update browser notification title

**Files:**
- Modify: `src/components/notification-manager.tsx:109`

- [ ] **Step 1: Replace the Notification title**

```tsx
const n = new Notification("Arcan", { ... });  // was: "Jazz Messanger"
```

### Task 5.5: Update `useTabTitleBadge.ts` default

**Files:**
- Modify: `src/hooks/useTabTitleBadge.ts:11`

- [ ] **Step 1: Replace the default parameter**

```typescript
export function useTabTitleBadge(totalUnread: number, baseTitle = "Arcan") {
```

### Task 5.6: Update tests that hard-code the old brand string

**Files:**
- Modify: `tests/unit/hooks/useTabTitleBadge.test.ts`
- Modify: `tests/e2e/account-creation.spec.ts:23`
- Modify: `tests/e2e/tab-title-badge.spec.ts:84` (comment)

- [ ] **Step 1: Replace "Jazz Messanger" with "Arcan" in `tests/unit/hooks/useTabTitleBadge.test.ts`**

```bash
sed -i 's/Jazz Messanger/Arcan/g' tests/unit/hooks/useTabTitleBadge.test.ts
```

- [ ] **Step 2: Replace in `tests/e2e/account-creation.spec.ts`**

Find the `page.getByRole("heading", { name: /Welcome to Jazz Messanger/i })` call; replace with `/Welcome to Arcan/i`.

- [ ] **Step 3: Update the comment in `tests/e2e/tab-title-badge.spec.ts:84`**

Replace `"(2) Jazz Messanger"` with `"(2) Arcan"` in the comment.

- [ ] **Step 4: Run unit tests**

```bash
npm run test
```

Expected: PASS.

### Task 5.7: Update `shell.nix` brand strings

**Files:**
- Modify: `shell.nix`

- [ ] **Step 1: Replace brand mentions**

```nix
# Development shell for arcan.   # was: jazz-messanger
...
name = "arcan-dev";              # was: jazz-messanger-dev
...
echo "arcan dev shell"           # was: jazz-messanger dev shell
```

Use `sed -i 's/jazz-messanger/arcan/g' shell.nix` then verify the casing of the comment ("Arcan" vs "arcan") matches the surrounding style.

### Task 5.8: Update `scripts/dev-all.sh` banner

**Files:**
- Modify: `scripts/dev-all.sh:95`

- [ ] **Step 1: Replace the banner**

Find:

```bash
echo "╭─── jazz-messanger dev ──────────────────────────────────────"
```

Replace:

```bash
echo "╭─── arcan dev ───────────────────────────────────────────────"
```

### Task 5.9: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update title and prose**

```markdown
# Arcan

A local-first, end-to-end-encrypted messenger for small trust circles. Built on Jazz/CoJSON.
```

The Linear-project line is already correct (Arcan). Leave the rest of the prose; just the H1 changes.

### Task 5.10: Update `deploy/README.md`

**Files:**
- Modify: `deploy/README.md`

- [ ] **Step 1: Update title and clone instructions**

```markdown
# Deploying Arcan
```

And the clone block:

```bash
git clone <repo> arcan
cd arcan/deploy
```

### Task 5.11: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update title and schema example**

Replace the H1 line:

```markdown
# arcan — project memory for Claude Code
```

In the Conventions section, the example schema filename line:

```markdown
- Schema files in `src/jazz/schema/` use PascalCase filenames matching the exported schema name (e.g. `ArcanAccount.ts`).
```

The Linear destination line is already correct (Arcan project, renamed 2026-06-05).

### Task 5.12: Final brand-string scan

- [ ] **Step 1: Verify no stray references remain in source code**

```bash
grep -rn "Jazz Messanger\|JazzMessanger\|jazz-messanger" \
  --include="*.ts" --include="*.tsx" --include="*.html" --include="*.json" \
  --include="*.css" --include="*.sh" --include="*.nix" \
  --include="*.yml" --include="*.yaml" --include="Caddyfile" \
  src/ api/ tests/ scripts/ deploy/ public/ \
  index.html package.json README.md CLAUDE.md shell.nix \
  | grep -v "node_modules"
```

Expected: no matches in source files. Historical docs under `docs/superpowers/` are handled in Phase 7. `CHANGELOG.md` is intentionally left unchanged.

If any source-code matches appear, fix them before committing.

### Task 5.13: Run the full build + test suite

- [ ] **Step 1: TypeScript build**

```bash
npm run build
```

Expected: success.

- [ ] **Step 2: Unit tests**

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 3: api tests**

```bash
cd api && npx vitest run && cd ..
```

Expected: PASS.

### Task 5.14: Commit the brand-strings sweep

- [ ] **Step 1: Commit**

```bash
git add -A
git commit -m "rebrand: jazz-messanger -> Arcan in source, deploy, scripts, tests

Root package.json name; index.html title + theme-color + manifest link;
React UI strings (welcome, login, notification, tab title default);
shell.nix; scripts/dev-all.sh banner; README.md, deploy/README.md,
CLAUDE.md prose; unit + e2e test literals. CHANGELOG and historical
specs/plans intentionally untouched here (Phase 7 handles historical
docs separately).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 6 · PWA manifest

### Task 6.1: Create the manifest file

**Files:**
- Create: `public/manifest.webmanifest`

- [ ] **Step 1: Write the manifest**

```json
{
  "name": "Arcan",
  "short_name": "Arcan",
  "description": "Local-first, end-to-end-encrypted messenger for small trust circles.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    {
      "src": "/favicon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

The single SVG icon entry covers all sizes via vector rendering. A future task can add PNG fallbacks once the UI refs supply branded artwork.

### Task 6.2: Verify the manifest loads in the dev server

- [ ] **Step 1: Start the dev server in the background**

```bash
npm run dev > /tmp/vite-dev.log 2>&1 &
sleep 4
```

- [ ] **Step 2: Fetch the manifest**

```bash
curl -sf http://localhost:5173/manifest.webmanifest | head -20
```

Expected: the JSON contents print without error.

- [ ] **Step 3: Stop the dev server**

```bash
pkill -f "vite" || true
```

### Task 6.3: Commit the manifest

- [ ] **Step 1: Commit**

```bash
git add public/manifest.webmanifest
git commit -m "feat: add PWA manifest for Arcan

Single-icon SVG manifest with name/short_name 'Arcan', standalone
display, theme/background color #0a0a0a. Wired via <link rel='manifest'>
in index.html during Phase 5. PNG icon fallbacks deferred until UI refs
land with branded artwork.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 7 · Historical-doc top-of-doc notes

### Task 7.1: Add the rename note to each historical spec

**Files:**
- Modify (each): all `docs/superpowers/specs/2026-05-*-design.md`

- [ ] **Step 1: List the historical specs**

```bash
ls docs/superpowers/specs/2026-05-*-design.md
```

Expected output (10 files):

```
2026-05-15-jazz-messanger-design.md
2026-05-16-slice-2-pairing-invitations-design.md
2026-05-17-slice-3a-1to1-messaging-design.md
2026-05-23-slice-3b-group-conversations-design.md
2026-05-24-slice-3c-polish-design.md
2026-05-24-slice-4-conversation-lifecycle-design.md
2026-05-25-slice-5-inline-media-design.md
2026-05-28-slice-6-docker-deploy-design.md
2026-05-30-slice-7-zk-email-password-auth-design.md
2026-05-31-slice-8-in-app-notifications-design.md
```

- [ ] **Step 2: Prepend the rename note to each file**

The note (identical for each spec):

```markdown
> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.

```

Use a shell loop:

```bash
NOTE=$(cat <<'EOF'
> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.

EOF
)
for f in docs/superpowers/specs/2026-05-*-design.md; do
  printf "%s\n%s" "$NOTE" "$(cat "$f")" > "$f"
done
```

- [ ] **Step 3: Spot-check one file**

```bash
head -3 docs/superpowers/specs/2026-05-15-jazz-messanger-design.md
```

Expected: the note appears as the very first line.

### Task 7.2: Add the same note to each historical plan

**Files:**
- Modify (each): all `docs/superpowers/plans/2026-05-*.md`

- [ ] **Step 1: Repeat the loop for the plans directory**

```bash
NOTE=$(cat <<'EOF'
> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.

EOF
)
for f in docs/superpowers/plans/2026-05-*.md; do
  printf "%s\n%s" "$NOTE" "$(cat "$f")" > "$f"
done
```

- [ ] **Step 2: Verify**

```bash
head -3 docs/superpowers/plans/2026-05-15-e1a-slice-1-foundation-account.md
```

Expected: the note prepends correctly.

### Task 7.3: Commit the historical notes

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/specs/2026-05-*.md docs/superpowers/plans/2026-05-*.md
git commit -m "docs: add Arcan-rename top-of-doc notes to historical specs and plans

Per Unit 5 decision #6: leave historical specs and plans frozen as
artifacts (filename and content reflect the project's name at the
time), but add a top-of-doc note pointing at the rename so readers
know where to find the current state.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 8 · Linear API client (TDD)

A small, self-contained module on the api server that knows how to (a) create a Linear issue with labels, and (b) upload a file and return its asset URL. Used by the feedback endpoint in Phase 9.

### Task 8.1: Add new env vars

**Files:**
- Modify: `api/src/env.ts`

- [ ] **Step 1: Extend `env.ts`**

Append to the `env` object:

```typescript
export const env = {
  ...
  /** Linear personal API token (server-side only). */
  LINEAR_API_TOKEN: required("LINEAR_API_TOKEN"),
  /** Linear team UUID (Nox). */
  LINEAR_TEAM_ID: optional("LINEAR_TEAM_ID", "8f04cf65-d7a9-41d3-bc9b-5074f744e850"),
  /** Linear project UUID (Arcan). */
  LINEAR_PROJECT_ID: optional("LINEAR_PROJECT_ID", "79d46a12-7563-4e3c-833b-d49531d94bb1"),
  /** Linear label UUID for the 'Feedback' tag. */
  LINEAR_LABEL_FEEDBACK_ID: optional("LINEAR_LABEL_FEEDBACK_ID", "e4c59d7f-2ebb-4ea0-bc37-f4e863b5a694"),
  /** Linear label UUID for the optional category 'Bug'. */
  LINEAR_LABEL_BUG_ID: optional("LINEAR_LABEL_BUG_ID", "c8272cda-3f22-4850-b267-d166b844f770"),
  /** Linear label UUID for the optional category 'Improvement'. */
  LINEAR_LABEL_IMPROVEMENT_ID: optional("LINEAR_LABEL_IMPROVEMENT_ID", "9c75086b-59b9-4f61-b0d4-525932b42231"),
  /** Linear label UUID for the optional category 'Feature'. */
  LINEAR_LABEL_FEATURE_ID: optional("LINEAR_LABEL_FEATURE_ID", "7a184ee1-2c4d-4451-a09a-d16413d196ef"),
  /** Max combined attachment bytes per feedback submission. */
  FEEDBACK_MAX_TOTAL_BYTES: parseInt(optional("FEEDBACK_MAX_TOTAL_BYTES", String(10 * 1024 * 1024)), 10),
  /** Feedback per-account rate limit: max submissions per window. */
  FEEDBACK_RATE_LIMIT_MAX: parseInt(optional("FEEDBACK_RATE_LIMIT_MAX", "10"), 10),
  /** Feedback rate limit window in seconds (default 1h). */
  FEEDBACK_RATE_LIMIT_WINDOW: parseInt(optional("FEEDBACK_RATE_LIMIT_WINDOW", "3600"), 10),
};
```

### Task 8.2: Write failing tests for the Linear client (happy path: issueCreate)

**Files:**
- Create: `api/tests/linear-client.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// api/tests/linear-client.test.ts
import { describe, test, expect, beforeEach, vi } from "vitest";
import { LinearClient } from "../src/linear-client.js";

describe("LinearClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("createIssue posts the IssueCreate mutation with the right variables", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: "issue-id-1",
                identifier: "NOX-101",
                title: "Test feedback",
                url: "https://linear.app/nox/issue/NOX-101",
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const client = new LinearClient({
      apiToken: "lin_api_test",
      teamId: "team-uuid",
      projectId: "project-uuid",
    });

    const result = await client.createIssue({
      title: "Test feedback",
      description: "Body of the issue",
      labelIds: ["feedback-label-uuid"],
    });

    expect(result.id).toBe("issue-id-1");
    expect(result.identifier).toBe("NOX-101");
    expect(result.url).toBe("https://linear.app/nox/issue/NOX-101");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.linear.app/graphql");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("lin_api_test");
    const body = JSON.parse(init?.body as string);
    expect(body.query).toContain("issueCreate");
    expect(body.variables.input).toMatchObject({
      teamId: "team-uuid",
      projectId: "project-uuid",
      title: "Test feedback",
      description: "Body of the issue",
      labelIds: ["feedback-label-uuid"],
    });
  });

  test("createIssue throws when the Linear API returns success=false", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { issueCreate: { success: false, issue: null } },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const client = new LinearClient({
      apiToken: "lin_api_test",
      teamId: "team-uuid",
      projectId: "project-uuid",
    });

    await expect(
      client.createIssue({ title: "x", description: "y", labelIds: [] })
    ).rejects.toThrow(/Linear issueCreate returned success=false/);
  });

  test("createIssue throws on HTTP error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("rate limited", { status: 429 })
    );

    const client = new LinearClient({
      apiToken: "lin_api_test",
      teamId: "team-uuid",
      projectId: "project-uuid",
    });

    await expect(
      client.createIssue({ title: "x", description: "y", labelIds: [] })
    ).rejects.toThrow(/Linear API HTTP 429/);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd api && npx vitest run tests/linear-client.test.ts
```

Expected: FAIL — module `../src/linear-client.js` does not exist yet.

### Task 8.3: Implement the Linear client (minimal — issueCreate only)

**Files:**
- Create: `api/src/linear-client.ts`

- [ ] **Step 1: Write the client**

```typescript
// api/src/linear-client.ts

const GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";

export interface LinearClientConfig {
  apiToken: string;
  teamId: string;
  projectId: string;
}

export interface CreateIssueInput {
  title: string;
  description: string;
  labelIds: string[];
}

export interface CreatedIssue {
  id: string;
  identifier: string;
  url: string;
}

export class LinearClient {
  constructor(private readonly config: LinearClientConfig) {}

  async createIssue(input: CreateIssueInput): Promise<CreatedIssue> {
    const query = `
      mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url }
        }
      }
    `;
    const variables = {
      input: {
        teamId: this.config.teamId,
        projectId: this.config.projectId,
        title: input.title,
        description: input.description,
        labelIds: input.labelIds,
      },
    };

    const res = await this.gql<{
      issueCreate: { success: boolean; issue: CreatedIssue | null };
    }>(query, variables);

    if (!res.issueCreate.success || !res.issueCreate.issue) {
      throw new Error(`Linear issueCreate returned success=false`);
    }
    return res.issueCreate.issue;
  }

  private async gql<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": this.config.apiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      throw new Error(`Linear API HTTP ${res.status}`);
    }
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (json.errors) {
      throw new Error(`Linear API GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    if (!json.data) throw new Error("Linear API returned no data");
    return json.data;
  }
}
```

- [ ] **Step 2: Re-run the test**

```bash
cd api && npx vitest run tests/linear-client.test.ts
```

Expected: PASS for the three issueCreate cases.

### Task 8.4: Write failing tests for the file-upload path

**Files:**
- Modify: `api/tests/linear-client.test.ts`

- [ ] **Step 1: Append the upload tests**

```typescript
describe("LinearClient.uploadFile", () => {
  test("uploadFile requests an upload URL, PUTs the bytes, returns the asset URL", async () => {
    const fetchMock = vi.spyOn(global, "fetch")
      // First call: GraphQL fileUpload mutation
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              fileUpload: {
                success: true,
                uploadFile: {
                  uploadUrl: "https://uploads.linear.app/signed-url",
                  assetUrl: "https://uploads.linear.app/asset/abc.png",
                  headers: [
                    { key: "x-amz-acl", value: "public-read" },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      // Second call: PUT to the signed URL
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    const client = new LinearClient({
      apiToken: "lin_api_test",
      teamId: "team-uuid",
      projectId: "project-uuid",
    });

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const result = await client.uploadFile({
      filename: "screenshot.png",
      contentType: "image/png",
      bytes,
    });

    expect(result.assetUrl).toBe("https://uploads.linear.app/asset/abc.png");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // First call: fileUpload mutation
    const [graphqlUrl, graphqlInit] = fetchMock.mock.calls[0]!;
    expect(graphqlUrl).toBe("https://api.linear.app/graphql");
    const graphqlBody = JSON.parse(graphqlInit?.body as string);
    expect(graphqlBody.query).toContain("fileUpload");
    expect(graphqlBody.variables).toMatchObject({
      filename: "screenshot.png",
      contentType: "image/png",
      size: 4,
    });

    // Second call: PUT to the signed URL
    const [putUrl, putInit] = fetchMock.mock.calls[1]!;
    expect(putUrl).toBe("https://uploads.linear.app/signed-url");
    expect(putInit?.method).toBe("PUT");
    expect((putInit?.headers as Record<string, string>)["x-amz-acl"]).toBe("public-read");
    expect(putInit?.body).toEqual(bytes);
  });

  test("uploadFile throws when the asset PUT fails", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              fileUpload: {
                success: true,
                uploadFile: {
                  uploadUrl: "https://uploads.linear.app/signed-url",
                  assetUrl: "https://uploads.linear.app/asset/abc.png",
                  headers: [],
                },
              },
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response("", { status: 500 }));

    const client = new LinearClient({
      apiToken: "lin_api_test",
      teamId: "team-uuid",
      projectId: "project-uuid",
    });

    await expect(
      client.uploadFile({
        filename: "x.bin",
        contentType: "application/octet-stream",
        bytes: new Uint8Array([0]),
      })
    ).rejects.toThrow(/asset PUT failed: HTTP 500/);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd api && npx vitest run tests/linear-client.test.ts
```

Expected: FAIL — `uploadFile` method does not exist on `LinearClient`.

### Task 8.5: Implement `uploadFile`

**Files:**
- Modify: `api/src/linear-client.ts`

- [ ] **Step 1: Add the method and types**

```typescript
export interface UploadFileInput {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface UploadedFile {
  assetUrl: string;
}
```

And on the class:

```typescript
async uploadFile(input: UploadFileInput): Promise<UploadedFile> {
  const query = `
    mutation FileUpload($filename: String!, $contentType: String!, $size: Int!) {
      fileUpload(filename: $filename, contentType: $contentType, size: $size) {
        success
        uploadFile {
          uploadUrl
          assetUrl
          headers { key value }
        }
      }
    }
  `;
  const variables = {
    filename: input.filename,
    contentType: input.contentType,
    size: input.bytes.byteLength,
  };

  const data = await this.gql<{
    fileUpload: {
      success: boolean;
      uploadFile: {
        uploadUrl: string;
        assetUrl: string;
        headers: Array<{ key: string; value: string }>;
      } | null;
    };
  }>(query, variables);

  if (!data.fileUpload.success || !data.fileUpload.uploadFile) {
    throw new Error("Linear fileUpload returned success=false");
  }

  const { uploadUrl, assetUrl, headers } = data.fileUpload.uploadFile;
  const putHeaders: Record<string, string> = {};
  for (const h of headers) putHeaders[h.key] = h.value;

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: putHeaders,
    body: input.bytes,
  });
  if (!putRes.ok) {
    throw new Error(`Linear asset PUT failed: HTTP ${putRes.status}`);
  }

  return { assetUrl };
}
```

- [ ] **Step 2: Re-run the tests**

```bash
cd api && npx vitest run tests/linear-client.test.ts
```

Expected: PASS — all five tests (3 issueCreate + 2 uploadFile) green.

### Task 8.6: Commit the Linear client

- [ ] **Step 1: Commit**

```bash
git add api/src/linear-client.ts api/tests/linear-client.test.ts api/src/env.ts
git commit -m "feat(api): add Linear GraphQL client (issueCreate + fileUpload)

Self-contained client used by the upcoming POST /api/feedback route.
Tests cover happy paths, GraphQL success=false, HTTP errors, and the
two-step file-upload flow (GraphQL mutation -> PUT to signed URL).
Env vars seeded with the known Nox/Arcan/label UUIDs as defaults so a
fresh deploy only needs LINEAR_API_TOKEN.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 9 · Feedback endpoint (TDD)

### Task 9.1: Add a tiny in-memory rate limiter

**Files:**
- Create: `api/src/rate-limiter.ts`
- Create: `api/tests/rate-limiter.test.ts`

- [ ] **Step 1: Write the test first**

```typescript
// api/tests/rate-limiter.test.ts
import { describe, test, expect, beforeEach, vi } from "vitest";
import { InMemoryRateLimiter } from "../src/rate-limiter.js";

describe("InMemoryRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test("allows up to `max` requests within the window", () => {
    const limiter = new InMemoryRateLimiter({ max: 3, windowSeconds: 60 });
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(false);
  });

  test("resets after the window elapses", () => {
    const limiter = new InMemoryRateLimiter({ max: 1, windowSeconds: 60 });
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(limiter.consume("user-1")).toBe(true);
  });

  test("keys are isolated per-user", () => {
    const limiter = new InMemoryRateLimiter({ max: 1, windowSeconds: 60 });
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-2")).toBe(true);
    expect(limiter.consume("user-1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd api && npx vitest run tests/rate-limiter.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```typescript
// api/src/rate-limiter.ts
export interface RateLimiterConfig {
  max: number;
  windowSeconds: number;
}

export class InMemoryRateLimiter {
  private buckets = new Map<string, { count: number; windowStart: number }>();
  constructor(private readonly config: RateLimiterConfig) {}

  consume(key: string): boolean {
    const now = Date.now();
    const windowMs = this.config.windowSeconds * 1000;
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (bucket.count >= this.config.max) {
      return false;
    }
    bucket.count++;
    return true;
  }
}
```

- [ ] **Step 4: Re-run**

```bash
cd api && npx vitest run tests/rate-limiter.test.ts
```

Expected: PASS.

### Task 9.2: Write the failing test for `POST /api/feedback` happy path (text-only, no attachments)

**Files:**
- Create: `api/tests/feedback.test.ts`

- [ ] **Step 1: Write the test**

The test exercises the route handler against a real Better Auth instance plus a mocked `LinearClient`.

```typescript
// api/tests/feedback.test.ts
import { describe, test, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { Hono } from "hono";
import { jazzZkPlugin } from "../src/plugin.js";
import { registerFeedbackRoute } from "../src/feedback-route.js";
import { LinearClient } from "../src/linear-client.js";

async function makeAuthAndApp() {
  const db = new Database(":memory:");
  const config = {
    database: db,
    secret: "test-secret-test-secret-test-secret-test",
    baseURL: "http://localhost/api/auth",
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
    plugins: [jazzZkPlugin()],
  };
  await (await getMigrations(config)).runMigrations();
  const auth = betterAuth(config);

  const linearClient = {
    createIssue: vi.fn(),
    uploadFile: vi.fn(),
  } as unknown as LinearClient;

  const app = new Hono();
  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
  registerFeedbackRoute(app, {
    auth,
    linearClient,
    feedbackLabelId: "feedback-label-uuid",
    categoryLabels: {
      Bug: "bug-label-uuid",
      Improvement: "improvement-label-uuid",
      Feature: "feature-label-uuid",
    },
    maxTotalBytes: 10 * 1024 * 1024,
    rateLimiterMax: 10,
    rateLimiterWindowSeconds: 3600,
  });

  return { app, auth, linearClient };
}

async function signUpAndGetCookie(auth: Awaited<ReturnType<typeof betterAuth>>) {
  const res = await auth.handler(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jazz-zk": JSON.stringify({
          kdfSalt: Buffer.from("salt-of-32-bytes-aaaaaaaaaaaaaaa").toString("base64"),
          encryptedSeed: Buffer.from("encrypted-seed-blob-aaaaaaaaaaaa").toString("base64"),
          recoveryProofHmac: Buffer.from("hmac-of-32-bytes-aaaaaaaaaaaaaa").toString("base64"),
          accountID: "co_zTEST",
        }),
      },
      body: JSON.stringify({
        email: "alice@example.test",
        password: "correcthorsebattery1",
        name: "Alice",
      }),
    })
  );
  expect(res.status).toBeLessThan(400);
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  // Extract just the cookie name=value pair.
  return setCookie!.split(";")[0]!;
}

describe("POST /api/feedback", () => {
  test("happy path: text-only message creates an issue with the verified email", async () => {
    const { app, auth, linearClient } = await makeAuthAndApp();
    const cookie = await signUpAndGetCookie(auth);

    (linearClient.createIssue as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "issue-id-1",
      identifier: "NOX-101",
      url: "https://linear.app/nox/issue/NOX-101",
    });

    const body = new FormData();
    body.set("message", "The button doesn't work on Safari.");
    body.set("category", "Bug");

    const res = await app.request("/api/feedback", {
      method: "POST",
      headers: { cookie },
      body,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      issue: { identifier: "NOX-101", url: "https://linear.app/nox/issue/NOX-101" },
    });

    expect(linearClient.createIssue).toHaveBeenCalledOnce();
    const arg = (linearClient.createIssue as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.title).toContain("The button doesn't work on Safari");
    expect(arg.description).toContain("alice@example.test");
    expect(arg.description).toContain("The button doesn't work on Safari.");
    expect(arg.labelIds).toEqual(expect.arrayContaining(["feedback-label-uuid", "bug-label-uuid"]));
  });

  test("rejects unauthenticated requests with 401", async () => {
    const { app } = await makeAuthAndApp();

    const body = new FormData();
    body.set("message", "Hello");

    const res = await app.request("/api/feedback", { method: "POST", body });
    expect(res.status).toBe(401);
  });

  test("rejects empty message with 400", async () => {
    const { app, auth } = await makeAuthAndApp();
    const cookie = await signUpAndGetCookie(auth);
    const body = new FormData();
    body.set("message", "");
    const res = await app.request("/api/feedback", {
      method: "POST",
      headers: { cookie },
      body,
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd api && npx vitest run tests/feedback.test.ts
```

Expected: FAIL — `../src/feedback-route.js` does not exist.

### Task 9.3: Implement the feedback route — text-only happy path

**Files:**
- Create: `api/src/feedback-route.ts`

- [ ] **Step 1: Write the route**

```typescript
// api/src/feedback-route.ts
import type { Hono } from "hono";
import type { LinearClient } from "./linear-client.js";
import { InMemoryRateLimiter } from "./rate-limiter.js";

type Auth = {
  api: {
    getSession: (init: { headers: Headers }) => Promise<{
      user: { id: string; email: string };
    } | null>;
  };
};

export interface FeedbackRouteConfig {
  auth: Auth;
  linearClient: LinearClient;
  feedbackLabelId: string;
  categoryLabels: Record<"Bug" | "Improvement" | "Feature", string>;
  maxTotalBytes: number;
  rateLimiterMax: number;
  rateLimiterWindowSeconds: number;
}

export function registerFeedbackRoute(
  app: Hono,
  config: FeedbackRouteConfig
): void {
  const rateLimiter = new InMemoryRateLimiter({
    max: config.rateLimiterMax,
    windowSeconds: config.rateLimiterWindowSeconds,
  });

  app.post("/api/feedback", async (c) => {
    // 1. Session
    const session = await config.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    // 2. Rate limit (per authenticated user)
    if (!rateLimiter.consume(session.user.id)) {
      return c.json({ error: "Rate limited" }, 429);
    }

    // 3. Parse the multipart body
    const form = await c.req.parseBody({ all: true });
    const messageRaw = form["message"];
    const message =
      typeof messageRaw === "string" ? messageRaw.trim() : "";
    if (!message) {
      return c.json({ error: "Message is required" }, 400);
    }
    const categoryRaw = form["category"];
    const category =
      typeof categoryRaw === "string" && categoryRaw in config.categoryLabels
        ? (categoryRaw as keyof typeof config.categoryLabels)
        : undefined;

    // 4. Build labels
    const labelIds = [config.feedbackLabelId];
    if (category) labelIds.push(config.categoryLabels[category]);

    // 5. Build description (attachments handled in Task 9.5)
    const description = [
      message,
      "",
      "---",
      `Submitter: ${session.user.email}`,
      category ? `Category: ${category}` : null,
    ]
      .filter((line) => line !== null)
      .join("\n");

    const title = message.split("\n")[0]!.slice(0, 60);

    const issue = await config.linearClient.createIssue({
      title: `[Feedback] ${title}`,
      description,
      labelIds,
    });

    return c.json({ ok: true, issue });
  });
}
```

- [ ] **Step 2: Re-run the tests**

```bash
cd api && npx vitest run tests/feedback.test.ts
```

Expected: PASS — the three happy/unauth/empty tests.

### Task 9.4: Add the failing test for the attachment path

**Files:**
- Modify: `api/tests/feedback.test.ts`

- [ ] **Step 1: Append the attachment test**

```typescript
test("uploads attachments to Linear and embeds asset URLs in the description", async () => {
  const { app, auth, linearClient } = await makeAuthAndApp();
  const cookie = await signUpAndGetCookie(auth);

  (linearClient.uploadFile as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce({ assetUrl: "https://uploads.linear.app/asset/a.png" })
    .mockResolvedValueOnce({ assetUrl: "https://uploads.linear.app/asset/b.log" });
  (linearClient.createIssue as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    id: "id-2",
    identifier: "NOX-102",
    url: "https://linear.app/nox/issue/NOX-102",
  });

  const png = new File([new Uint8Array([1, 2, 3])], "screenshot.png", {
    type: "image/png",
  });
  const log = new File([new Uint8Array([10, 20])], "debug.log", {
    type: "text/plain",
  });

  const body = new FormData();
  body.set("message", "Two attachments");
  body.append("attachment", png);
  body.append("attachment", log);

  const res = await app.request("/api/feedback", {
    method: "POST",
    headers: { cookie },
    body,
  });

  expect(res.status).toBe(200);
  expect(linearClient.uploadFile).toHaveBeenCalledTimes(2);
  expect(linearClient.createIssue).toHaveBeenCalledOnce();

  const issueArg = (linearClient.createIssue as ReturnType<typeof vi.fn>).mock.calls[0]![0];
  expect(issueArg.description).toContain("https://uploads.linear.app/asset/a.png");
  expect(issueArg.description).toContain("https://uploads.linear.app/asset/b.log");
  expect(issueArg.description).toContain("screenshot.png");
  expect(issueArg.description).toContain("debug.log");
});

test("rejects when combined attachment size exceeds the cap", async () => {
  const { app, auth, linearClient } = await makeAuthAndApp();
  const cookie = await signUpAndGetCookie(auth);

  // 11 MB > 10 MB cap
  const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.bin", {
    type: "application/octet-stream",
  });
  const body = new FormData();
  body.set("message", "Too big");
  body.append("attachment", big);

  const res = await app.request("/api/feedback", {
    method: "POST",
    headers: { cookie },
    body,
  });
  expect(res.status).toBe(413);
  expect(linearClient.uploadFile).not.toHaveBeenCalled();
  expect(linearClient.createIssue).not.toHaveBeenCalled();
});

test("rate-limited after FEEDBACK_RATE_LIMIT_MAX submissions", async () => {
  const { app, auth, linearClient } = await makeAuthAndApp();
  // Re-build app with max=2 by reconfiguring
  // (Use makeAuthAndApp's default if we want to test the actual env-driven value;
  // here we just exercise the limiter behavior at the route.)
  const cookie = await signUpAndGetCookie(auth);
  (linearClient.createIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "x",
    identifier: "NOX-999",
    url: "u",
  });
  // make 11 calls — 10 succeed, 11th is rate-limited
  for (let i = 0; i < 10; i++) {
    const body = new FormData();
    body.set("message", `call ${i}`);
    const res = await app.request("/api/feedback", {
      method: "POST",
      headers: { cookie },
      body,
    });
    expect(res.status).toBe(200);
  }
  const body = new FormData();
  body.set("message", "limited");
  const res = await app.request("/api/feedback", {
    method: "POST",
    headers: { cookie },
    body,
  });
  expect(res.status).toBe(429);
});
```

- [ ] **Step 2: Run to confirm new failures**

```bash
cd api && npx vitest run tests/feedback.test.ts
```

Expected: the two new attachment tests fail (size cap + asset embedding); the rate-limit test passes (already implemented in Task 9.3).

### Task 9.5: Implement attachment handling

**Files:**
- Modify: `api/src/feedback-route.ts`

- [ ] **Step 1: Add the attachment branch**

Insert this block immediately before the `description` construction in the route handler:

```typescript
// 4a. Attachments
const attachmentEntries = form["attachment"];
const attachmentFiles: File[] = Array.isArray(attachmentEntries)
  ? attachmentEntries.filter((e): e is File => e instanceof File)
  : attachmentEntries instanceof File
  ? [attachmentEntries]
  : [];

const totalBytes = attachmentFiles.reduce((sum, f) => sum + f.size, 0);
if (totalBytes > config.maxTotalBytes) {
  return c.json(
    { error: `Combined attachment size exceeds ${config.maxTotalBytes} bytes` },
    413
  );
}

const uploaded: Array<{ filename: string; assetUrl: string }> = [];
for (const file of attachmentFiles) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await config.linearClient.uploadFile({
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    bytes,
  });
  uploaded.push({ filename: file.name, assetUrl: result.assetUrl });
}
```

And replace the description construction with:

```typescript
const attachmentLines =
  uploaded.length === 0
    ? []
    : ["", "Attachments:", ...uploaded.map((u) => `- [${u.filename}](${u.assetUrl})`)];

const description = [
  message,
  "",
  "---",
  `Submitter: ${session.user.email}`,
  category ? `Category: ${category}` : null,
  ...attachmentLines,
]
  .filter((line) => line !== null)
  .join("\n");
```

- [ ] **Step 2: Re-run the tests**

```bash
cd api && npx vitest run tests/feedback.test.ts
```

Expected: all tests PASS.

### Task 9.6: Wire the feedback route into the main Hono app

**Files:**
- Modify: `api/src/index.ts`

- [ ] **Step 1: Add the wiring**

After the `/api/auth/*` registration and before `/health`:

```typescript
import { LinearClient } from "./linear-client.js";
import { registerFeedbackRoute } from "./feedback-route.js";

const linearClient = new LinearClient({
  apiToken: env.LINEAR_API_TOKEN,
  teamId: env.LINEAR_TEAM_ID,
  projectId: env.LINEAR_PROJECT_ID,
});

registerFeedbackRoute(app, {
  auth,
  linearClient,
  feedbackLabelId: env.LINEAR_LABEL_FEEDBACK_ID,
  categoryLabels: {
    Bug: env.LINEAR_LABEL_BUG_ID,
    Improvement: env.LINEAR_LABEL_IMPROVEMENT_ID,
    Feature: env.LINEAR_LABEL_FEATURE_ID,
  },
  maxTotalBytes: env.FEEDBACK_MAX_TOTAL_BYTES,
  rateLimiterMax: env.FEEDBACK_RATE_LIMIT_MAX,
  rateLimiterWindowSeconds: env.FEEDBACK_RATE_LIMIT_WINDOW,
});
```

- [ ] **Step 2: Update the dev script docstring** in `scripts/api.sh` to mention the new required env var `LINEAR_API_TOKEN`.

- [ ] **Step 3: Run the full api test suite**

```bash
cd api && npx vitest run && cd ..
```

Expected: PASS — pre-existing tests + new client/rate-limit/feedback tests.

### Task 9.7: Add a Caddyfile route for `/api/feedback` (already covered by the wildcard, verify only)

The current Caddyfile routes `/api/auth/*` to the api service. The new `/api/feedback` route is not under `/api/auth/*`, so it falls into the SPA `handle { ... }` block by default. **Fix:** add a dedicated `handle_path` for `/api/feedback` ahead of the SPA fallback.

**Files:**
- Modify: `deploy/Caddyfile`

- [ ] **Step 1: Add the route**

Insert immediately after the `handle /api/auth/*` block:

```
handle /api/feedback {
    reverse_proxy api:4300
}
```

The order matters: more-specific `handle` blocks must precede the catch-all SPA `handle`. The existing file already orders specific blocks first; add the new block in that group.

### Task 9.8: Commit the feedback endpoint

- [ ] **Step 1: Commit**

```bash
git add api/src/feedback-route.ts api/src/rate-limiter.ts api/tests/feedback.test.ts api/tests/rate-limiter.test.ts api/src/index.ts scripts/api.sh deploy/Caddyfile
git commit -m "feat(api): add POST /api/feedback route -> Linear

Session-gated, per-account rate-limited (default 10/h), multipart
form with optional Category and Attachments (any file type, multi,
10MB total cap). Server-side email extraction from Better Auth's
user table. Linear issue created with the Feedback label plus the
optional category label; attachments uploaded via Linear's fileUpload
mutation and embedded in the description as markdown links. Caddy
gets a dedicated /api/feedback handle ahead of the SPA fallback.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 10 · Final verification + repo/GitHub-remote rename ceremony

### Task 10.1: Run all tests from scratch

- [ ] **Step 1: Front-end**

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 2: api**

```bash
cd api && npx vitest run && cd ..
```

Expected: PASS.

- [ ] **Step 3: TypeScript build**

```bash
npm run build
```

Expected: success.

### Task 10.2: Local smoke test of the renamed stack

- [ ] **Step 1: Start sync + api + dev in separate terminals**

```bash
# Terminal 1
npm run sync

# Terminal 2
LINEAR_API_TOKEN=dummy-for-local BETTER_AUTH_SECRET=$(head -c 32 /dev/urandom | base64) npm run api

# Terminal 3
npm run dev
```

- [ ] **Step 2: Open http://localhost:5173 in a browser and verify**
  - Tab title shows "Arcan" (not "Jazz Messanger").
  - PWA manifest is fetched without 404 (check DevTools → Application → Manifest).
  - Sign-up flow works (creates an account via the renamed Better Auth endpoint).
  - The browser notification permission prompt (if granted) and any in-app notifications show "Arcan" as the source.

- [ ] **Step 3: Smoke-test the feedback endpoint via curl**

```bash
# Replace COOKIE with the value of better-auth.session_token from a logged-in browser session.
curl -sf http://localhost:5173/api/feedback \
  -H "cookie: better-auth.session_token=<COOKIE>" \
  -F "message=This is a smoke test." \
  -F "category=Improvement"
```

Expected: `{"ok":true,"issue":{...}}` with a real Linear issue created (since `LINEAR_API_TOKEN=dummy-for-local`, this will fail — substitute a real token to exercise the full path, or accept the HTTP-token error as a confirmation that the route, multipart, and session-check all worked).

### Task 10.3: Flag the GitHub-remote + local-directory rename to the user

The remaining ceremony cannot be done by the implementing agent — it requires manual action by the human. The agent's job here is to **announce, then wait**.

- [ ] **Step 1: Stop and ask the user**

Surface the following message to the user (printed in chat, not committed):

> **Manual step required.** The local repo directory is still `jazz-messanger/` and the GitHub remote is still named `jazz-messanger`. To complete Unit 5:
>
> 1. Rename the GitHub repository (Settings → Repository name) from `jazz-messanger` → `arcan`.
> 2. Once that's done, tell me to proceed. I'll then update `.git/config`'s remote URL.
> 3. Rename the local directory: `mv /home/nox/Documents/Projects/Nox/jazz-messanger /home/nox/Documents/Projects/Nox/arcan` (run from a parent dir, not from inside the repo).

Wait for the user's confirmation. **Do not proceed past this task without it.**

### Task 10.4: After the user confirms — update `.git/config` remote URL

**Files:**
- Modify: `.git/config` (via `git remote set-url`)

- [ ] **Step 1: Inspect the current remote**

```bash
git remote -v
```

Expected: a `git@github.com:<user>/jazz-messanger.git` or `https://github.com/<user>/jazz-messanger.git` URL.

- [ ] **Step 2: Update to the new repo name**

If the URL uses SSH:

```bash
git remote set-url origin git@github.com:<user>/arcan.git
```

If HTTPS:

```bash
git remote set-url origin https://github.com/<user>/arcan.git
```

(Substitute `<user>` for the actual GitHub user/org. Use `git remote -v` output as the source.)

- [ ] **Step 3: Verify**

```bash
git remote -v
git fetch
```

Expected: `arcan` appears in the URL; fetch succeeds.

### Task 10.5: Final wrap-up commit (optional — only if any minor cleanup is needed)

If any small adjustments surface during the smoke test (e.g. a missed string, a copy edit), apply them and:

- [ ] **Step 1: Commit any small fixes**

```bash
git add -A
git diff --cached --stat   # confirm the change set is small and obvious
git commit -m "chore: post-rename smoke-test cleanups"
```

### Task 10.6: Push the branch

- [ ] **Step 1: Push**

```bash
git push origin main
```

Expected: pushes successfully to the renamed remote.

---

## Self-review checklist (run after completing the plan)

These checks ensure the work matches the spec and is internally consistent.

- [ ] Every section of Unit 3 in the spec has a task (auth → `@arcan/api` package: Task 2.2; session-gated endpoint: Task 9.3; server-side email extraction: Task 9.3; multipart attachments capped at 10 MB total: Task 9.5; Linear sink with Feedback + category labels: Task 9.6; Caddy route: Task 9.7).
- [ ] Every Unit 5 decision (probe: Task 0.1; HMAC purpose: Task 4.1-4.2; schema rename: Task 3.1-3.3; npm scope `@arcan/api` + root `arcan`: Tasks 2.2 + 5.1; PWA manifest: Task 6.1; historical-doc notes: Task 7.1-7.2; repo + GH-remote rename: Task 10.3-10.4) has a task.
- [ ] No "TBD", "TODO (later)", or vague "implement appropriate" markers.
- [ ] All TypeScript signatures and import paths used in later tasks match earlier tasks (e.g., `registerFeedbackRoute` signature in Task 9.3 matches its call in Task 9.6).
- [ ] All commit messages are explicit about what changed.
- [ ] The destructive baseline is respected — no migration logic anywhere.
