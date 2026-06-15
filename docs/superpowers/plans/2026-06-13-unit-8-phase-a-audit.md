# Unit 8 — Phase A (audit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the Unit 8 audit doc — a categorized-deltas-with-severity inventory across every implemented surface at desktop + mobile viewports — by extracting the design references locally, capturing the live app via a one-shot Playwright script, and walking every surface side-by-side against the design.

**Architecture:** A small `scripts/audit/` capture toolkit (route extractor + fixture seeder + surface manifest + Playwright orchestrator) emits live screenshots + a JSON manifest. Then a structured, multi-source review pass populates the audit doc with one row per surface variant. The capture script is a standalone one-shot (not a persistent test suite); rerunnable for Phase C re-audit later.

**Tech Stack:** Playwright 1.52 (existing dep), TypeScript, the existing dev stack (`npm run dev:all`), and the design references in `ArcanUI.zip` (extracted to `design/`).

**Spec:** `docs/superpowers/specs/2026-06-13-unit-8-final-alignment-design.md`.

---

## Phase 0 · Setup

### Task 0.1: Branch + clean tree

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git status --short
git checkout main && git pull --ff-only
git checkout -b unit-8-phase-a-audit
```

### Task 0.2: Extract `ArcanUI.zip` and gitignore `design/`

**Files:**
- Read: `ArcanUI.zip` (at repo root)
- Create: `design/` (extracted, gitignored)
- Modify: `.gitignore`

- [ ] **Step 1: Extract**

```bash
python3 -c "import zipfile; zipfile.ZipFile('ArcanUI.zip').extractall('design/')"
ls design/ | head -20
```

Expected: 115 entries including `Jazz Hi-Fi App.html`, `Arcan Prototype.html`, `hf-chat.jsx`, `nox-tokens.css`, `screenshots/`, `brand/`.

- [ ] **Step 2: Gitignore `design/`**

In `.gitignore`, append:

```
# Unit 8 reference design pack — extracted from ArcanUI.zip locally,
# never committed. The zip itself stays in-repo for future re-extraction.
design/
```

- [ ] **Step 3: Verify**

```bash
git status --short | grep design || echo "design/ not tracked — correct"
```

Expected: no `design/` entries in git status.

### Task 0.3: Commit Phase 0

```bash
git add .gitignore
git commit -m "chore(unit-8): gitignore design/ — extracted ArcanUI.zip locally

Reference assets for Unit 8 audit. Extract once locally:
  python3 -c \"import zipfile; zipfile.ZipFile('ArcanUI.zip').extractall('design/')\"

design/ is gitignored. ArcanUI.zip stays in the repo for re-extraction.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 1 · Capture infrastructure

### Task 1.1: Surfaces catalog

**Files:**
- Create: `scripts/audit/surfaces.ts`

This file is the canonical list of surface variants captured by the audit. Each entry pairs a stable id, a route, the seed actions needed before the screenshot fires, and any modal trigger to fire post-load.

- [ ] **Step 1: Write the catalog**

```typescript
// scripts/audit/surfaces.ts

/**
 * A capturable surface variant. One entry → two PNGs (desktop + mobile).
 *
 * `id` is the stable filename slug. Use kebab-case; modal variants suffix
 * `--modal-<name>` so the diff against design references is unambiguous.
 *
 * `route` is the path to navigate to. `:id` placeholders get replaced with
 * the fixture values at capture time (see `fixtures.ts`).
 *
 * `state` is the named precondition the fixture seeder must reach before
 * capture. "anonymous" means: clear all storage, no sign-in.
 *
 * `modalTrigger` (optional) is a Playwright-locator that gets clicked
 * after the route loads, then the screenshot fires once the modal is on
 * screen. Used to capture dialogs/sheets without a dedicated route.
 *
 * `waitFor` (optional) is an additional locator that must be visible
 * before the screenshot fires. Defaults to body visibility.
 */
export interface Surface {
  id: string;
  route: string;
  state:
    | "anonymous"
    | "alice-empty"
    | "alice-with-bob-1to1"
    | "alice-with-group"
    | "alice-with-pending-connection"
    | "alice-with-live-invite";
  modalTrigger?: string;
  waitFor?: string;
}

export const SURFACES: Surface[] = [
  // ─── Auth + onboarding (anonymous) ───────────────────────────────────
  { id: "auth-login", route: "/auth/login", state: "anonymous" },
  { id: "auth-recovery", route: "/auth/recovery", state: "anonymous" },
  { id: "onboarding", route: "/onboarding", state: "anonymous" },

  // ─── Conversations list ──────────────────────────────────────────────
  { id: "conv-list-empty", route: "/", state: "alice-empty" },
  { id: "conv-list-1to1", route: "/", state: "alice-with-bob-1to1" },
  { id: "conv-list-group", route: "/", state: "alice-with-group" },

  // ─── Conversation detail ─────────────────────────────────────────────
  {
    id: "conv-detail-1to1",
    route: "/conversations/:convId",
    state: "alice-with-bob-1to1",
  },
  {
    id: "conv-detail-group",
    route: "/conversations/:convId",
    state: "alice-with-group",
  },
  {
    id: "conv-members-group",
    route: "/conversations/:convId/members",
    state: "alice-with-group",
  },
  { id: "conv-new", route: "/conversations/new", state: "alice-with-bob-1to1" },

  // ─── Contacts ────────────────────────────────────────────────────────
  // Contacts tab — sidebar tab state switched programmatically pre-capture.
  { id: "contacts-list", route: "/", state: "alice-with-bob-1to1" },
  { id: "contacts-add", route: "/contacts/add", state: "alice-empty" },

  // ─── Profile (polymorphic) ───────────────────────────────────────────
  { id: "profile-own", route: "/profile/:meId", state: "alice-with-bob-1to1" },
  {
    id: "profile-other",
    route: "/profile/:bobId",
    state: "alice-with-bob-1to1",
  },

  // ─── Connections ─────────────────────────────────────────────────────
  {
    id: "connections-pending-empty",
    route: "/connections/pending",
    state: "alice-empty",
  },
  {
    id: "connections-pending",
    route: "/connections/pending",
    state: "alice-with-pending-connection",
  },
  {
    id: "connections-live-invites-empty",
    route: "/connections/live-invites",
    state: "alice-empty",
  },
  {
    id: "connections-live-invites",
    route: "/connections/live-invites",
    state: "alice-with-live-invite",
  },

  // ─── Settings ────────────────────────────────────────────────────────
  { id: "settings-root", route: "/settings", state: "alice-with-bob-1to1" },
  { id: "settings-account", route: "/settings/account", state: "alice-empty" },
  { id: "settings-devices", route: "/settings/devices", state: "alice-empty" },
  {
    id: "settings-appearance",
    route: "/settings/appearance",
    state: "alice-empty",
  },
  {
    id: "settings-notifications",
    route: "/settings/notifications",
    state: "alice-empty",
  },
  { id: "settings-feedback", route: "/settings/feedback", state: "alice-empty" },

  // ─── Modal surfaces (route + modalTrigger) ───────────────────────────
  {
    id: "modal-change-password",
    route: "/settings/account",
    state: "alice-empty",
    modalTrigger: '[data-testid="change-password-button"]',
  },
  {
    id: "modal-view-recovery-code",
    route: "/settings/account",
    state: "alice-empty",
    modalTrigger: '[data-testid="view-recovery-code-button"]',
  },
  {
    id: "modal-pair-qr",
    route: "/settings/devices",
    state: "alice-empty",
    modalTrigger: '[data-testid="pair-device-button"]',
  },
];
```

- [ ] **Step 2: Sanity-check IDs are unique**

```bash
npx tsx -e "import { SURFACES } from './scripts/audit/surfaces.ts'; const ids = SURFACES.map(s => s.id); const dupes = ids.filter((id, i) => ids.indexOf(id) !== i); if (dupes.length) { console.error('Duplicate IDs:', dupes); process.exit(1); } console.log(\`\${ids.length} surfaces, all unique\`);"
```

Expected: `27 surfaces, all unique` (or whatever the count ends up).

- [ ] **Step 3: Cross-check against `src/App.tsx`**

```bash
grep -oE 'path="[^"]+"' src/App.tsx | sort -u
```

For every `<Route path=…>` in the live app, confirm there's at least one surface that exercises it. If a route is missing from `SURFACES`, add it. If `SURFACES` references a route that doesn't exist, remove it.

The cross-check is manual; the catalog is hand-edited because each variant maps to a meaningful state combination that can't be inferred from the route alone.

### Task 1.2: Fixture seeder

**Files:**
- Create: `scripts/audit/fixtures.ts`

Drives Playwright through the UI to reach each named state. The capture orchestrator calls `seedState(page, state)` before navigating to a surface.

- [ ] **Step 1: Write the seeder**

```typescript
// scripts/audit/fixtures.ts

import type { Page, BrowserContext } from "@playwright/test";

/**
 * Deterministic credentials used across the audit. The api server's
 * SQLite at `api/auth.sqlite` accumulates across runs; the audit
 * orchestrator wipes it once before the first run (see
 * capture-screens.ts), so these credentials always start unregistered.
 */
const ALICE = {
  email: "alice@arcan-audit.local",
  password: "audit-alice-password-12345",
  displayName: "Alice Audit",
};
const BOB = {
  email: "bob@arcan-audit.local",
  password: "audit-bob-password-12345",
  displayName: "Bob Audit",
};

/**
 * State the orchestrator can request. Each call returns the
 * substitutions the capture step needs (account IDs, conversation IDs).
 */
export interface Substitutions {
  meId?: string;
  bobId?: string;
  convId?: string;
}

export async function seedState(
  context: BrowserContext,
  state: string,
): Promise<Substitutions> {
  switch (state) {
    case "anonymous":
      await context.clearCookies();
      return {};

    case "alice-empty":
      return await signInAsAlice(context);

    case "alice-with-bob-1to1":
      return await aliceWithBob1to1(context);

    case "alice-with-group":
      return await aliceWithGroup(context);

    case "alice-with-pending-connection":
      return await aliceWithPendingConnection(context);

    case "alice-with-live-invite":
      return await aliceWithLiveInvite(context);

    default:
      throw new Error(`unknown fixture state: ${state}`);
  }
}

async function signInAsAlice(context: BrowserContext): Promise<Substitutions> {
  const page = await context.newPage();
  await page.goto("/auth/login");
  // If already signed in, the app redirects to /; bail early.
  if (page.url().endsWith("/")) {
    const meId = await readMeId(page);
    await page.close();
    return { meId };
  }
  // Try sign-in first; if account doesn't exist, fall through to sign-up.
  await page.fill('input[type=email]', ALICE.email);
  await page.fill('input[type=password]', ALICE.password);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname === "/" || u.pathname === "/onboarding", { timeout: 5000 }).catch(async () => {
    // sign-up path: go to onboarding, create the account
    await page.goto("/onboarding");
    await page.fill('input[name="email"]', ALICE.email);
    await page.fill('input[name="password"]', ALICE.password);
    await page.fill('input[name="displayName"]', ALICE.displayName);
    await page.click('button[type=submit]');
    await page.waitForURL("/", { timeout: 10000 });
  });
  const meId = await readMeId(page);
  await page.close();
  return { meId };
}

async function aliceWithBob1to1(
  context: BrowserContext,
): Promise<Substitutions> {
  const { meId } = await signInAsAlice(context);
  // Bob is created in a separate context, then Alice + Bob exchange via
  // the pair flow. For Phase A simplicity, we use the same browser context
  // sequentially: sign out, sign up Bob, send invite, sign back in as Alice,
  // accept. This is slow but deterministic.
  // ... [implementation: see Task 1.2 step 3 for the full helper]
  return { meId, bobId: "", convId: "" };
}

async function aliceWithGroup(
  context: BrowserContext,
): Promise<Substitutions> {
  // Same as 1to1 but creates a third account and a group.
  return { meId: "", bobId: "", convId: "" };
}

async function aliceWithPendingConnection(
  context: BrowserContext,
): Promise<Substitutions> {
  return { meId: "" };
}

async function aliceWithLiveInvite(
  context: BrowserContext,
): Promise<Substitutions> {
  return { meId: "" };
}

async function readMeId(page: Page): Promise<string> {
  // The avatar in the sidebar header has data-testid="me-avatar" with
  // data-account-id="<id>" attached (added in Unit 4).
  // If that test-id doesn't exist yet, fall back to evaluating the
  // window-exposed Jazz account ID.
  const el = await page.$('[data-testid="me-avatar"]');
  if (el) {
    const id = await el.getAttribute("data-account-id");
    if (id) return id;
  }
  return await page.evaluate(() => {
    // Last-resort: read from sessionStorage / the Jazz provider's window hook
    return (window as any).__jazzMeId ?? "";
  });
}
```

- [ ] **Step 2: Audit-only data-testid hooks**

Before the seeder can read account/conversation IDs reliably, ensure the live app exposes them at known test-ids. Check whether the following exist:

```bash
grep -rn 'data-testid="me-avatar"' src/components/sidebar.tsx src/components/profile-view.tsx 2>/dev/null
grep -rn 'data-account-id' src/ 2>/dev/null | head -10
```

If `data-testid="me-avatar"` doesn't exist yet, add it to the sidebar header's own-avatar element with `data-account-id={(me as any).$jazz.id}`. Keep the change minimal — it's a deterministic-state hook, not a feature.

If conversation rows don't expose `data-conversation-id`, add it to the sidebar row's button so the capture can pick up `convId` after a state seed.

- [ ] **Step 3: Flesh out the multi-account fixtures**

The skeleton above leaves `aliceWithBob1to1` / `aliceWithGroup` / connection fixtures as stubs. The full implementation:

```typescript
// helper used by the multi-account fixtures
async function signOut(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  await page.goto("/settings/account");
  await page.click('[data-testid="sign-out-button"]').catch(() => {});
  await context.clearCookies();
  await page.close();
}

async function signUpAs(
  context: BrowserContext,
  email: string,
  password: string,
  displayName: string,
): Promise<string> {
  const page = await context.newPage();
  await page.goto("/onboarding");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="displayName"]', displayName);
  await page.click('button[type=submit]');
  await page.waitForURL("/", { timeout: 10000 });
  const id = await readMeId(page);
  await page.close();
  return id;
}

async function aliceWithBob1to1(
  context: BrowserContext,
): Promise<Substitutions> {
  // Bob first (so Alice can accept his invite at the end and we end the
  // sequence signed in as Alice).
  await signOut(context);
  const bobId = await signUpAs(
    context,
    BOB.email,
    BOB.password,
    BOB.displayName,
  );
  // Bob creates a share-link invite and copies it.
  const bobPage = await context.newPage();
  await bobPage.goto("/contacts/add");
  await bobPage.click('[data-testid="invite-link-tab"]');
  await bobPage.click('[data-testid="generate-invite-button"]');
  const inviteUrl = await bobPage
    .locator('[data-testid="invite-link-value"]')
    .innerText();
  await bobPage.close();

  // Alice signs in, accepts the invite, opens the conversation.
  await signOut(context);
  const { meId } = await signInAsAlice(context);
  const alicePage = await context.newPage();
  await alicePage.goto(inviteUrl);
  await alicePage.click('[data-testid="accept-invite-button"]');
  await alicePage.waitForURL(/\/conversations\/[A-Za-z0-9_-]+/, {
    timeout: 10000,
  });
  // Send 3 messages for richer visual coverage.
  await alicePage.fill('[data-testid="composer-input"]', "Hi Bob!");
  await alicePage.press('[data-testid="composer-input"]', "Enter");
  await alicePage.fill(
    '[data-testid="composer-input"]',
    "How's the new build coming?",
  );
  await alicePage.press('[data-testid="composer-input"]', "Enter");
  await alicePage.fill(
    '[data-testid="composer-input"]',
    "Let me know when you're free 👋",
  );
  await alicePage.press('[data-testid="composer-input"]', "Enter");
  const url = alicePage.url();
  const convId = url.match(/\/conversations\/([A-Za-z0-9_-]+)/)?.[1] ?? "";
  await alicePage.close();
  return { meId, bobId, convId };
}
```

The `aliceWithGroup`, `aliceWithPendingConnection`, `aliceWithLiveInvite` fixtures follow the same shape. Pattern-match against `tests/e2e/*.spec.ts` for the data-testids and step sequences already exercised by e2e tests.

- [ ] **Step 4: Sanity-check the fixture compiles**

```bash
npx tsc --noEmit scripts/audit/fixtures.ts scripts/audit/surfaces.ts
```

Expected: no TS errors. If `@playwright/test` types aren't picked up from the root `tsconfig.json`, create a local `scripts/audit/tsconfig.json` that extends it and includes only `scripts/audit/`.

### Task 1.3: Route extractor

**Files:**
- Create: `scripts/audit/routes.ts`

Cross-checks the `SURFACES` catalog against `src/App.tsx`: every route the live app declares must appear in at least one surface. Run as part of the orchestrator to fail loudly when a route is added to the app without an audit row.

- [ ] **Step 1: Write the extractor**

```typescript
// scripts/audit/routes.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SURFACES } from "./surfaces.js";

const APP_TSX = resolve(process.cwd(), "src/App.tsx");

/**
 * Pull every `path="…"` value out of App.tsx. Catches both Route + Navigate
 * declarations; we filter the latter out (Navigate paths are targets, not
 * leaf surfaces).
 */
export function declaredRoutes(): string[] {
  const src = readFileSync(APP_TSX, "utf8");
  const out = new Set<string>();
  const routeRe = /<Route\s+path="([^"]+)"/g;
  for (const m of src.matchAll(routeRe)) {
    const p = m[1];
    if (p === "*") continue;
    out.add(p);
  }
  return Array.from(out).sort();
}

/**
 * Returns routes that App.tsx declares but no surface in `SURFACES`
 * exercises. Empty array = audit is complete.
 */
export function missingFromSurfaces(): string[] {
  const declared = declaredRoutes();
  const covered = new Set(SURFACES.map((s) => routeShape(s.route)));
  return declared.filter((r) => !covered.has(routeShape(r)));
}

/**
 * Normalises `/conversations/:id` and `/conversations/:convId` to the
 * same shape so the equality check ignores param names.
 */
function routeShape(route: string): string {
  return route.replace(/:[A-Za-z0-9_]+/g, ":id");
}
```

- [ ] **Step 2: Add a coverage check CLI**

Append to `scripts/audit/routes.ts`:

```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  const missing = missingFromSurfaces();
  if (missing.length) {
    console.error(`Routes in App.tsx not covered by SURFACES:`);
    for (const r of missing) console.error(`  - ${r}`);
    process.exit(1);
  }
  console.log(`All ${declaredRoutes().length} declared routes are covered.`);
}
```

- [ ] **Step 3: Run coverage**

```bash
npx tsx scripts/audit/routes.ts
```

Expected: `All N declared routes are covered.` If routes are missing, add them to `SURFACES` and re-run.

### Task 1.4: Capture orchestrator

**Files:**
- Create: `scripts/audit/capture-screens.ts`

Drives Playwright through the full surface catalog at both viewports.

- [ ] **Step 1: Write the orchestrator**

```typescript
// scripts/audit/capture-screens.ts

import { chromium } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SURFACES, type Surface } from "./surfaces.js";
import { seedState, type Substitutions } from "./fixtures.js";
import { missingFromSurfaces } from "./routes.js";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://localhost:5173";
const OUTPUT_DIR = resolve(
  process.cwd(),
  "docs/superpowers/audit/unit-8/live",
);
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
] as const;

interface ManifestEntry {
  id: string;
  route: string;
  state: string;
  viewport: string;
  file: string;
  capturedAt: string;
}

async function main(): Promise<void> {
  // Coverage gate.
  const missing = missingFromSurfaces();
  if (missing.length) {
    console.error(`SURFACES is missing routes:`);
    for (const r of missing) console.error(`  - ${r}`);
    process.exit(1);
  }

  // Clean output. Re-runs always overwrite — the doc references current
  // files, not historical snapshots.
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // NOTE: api/auth.sqlite + .jazz-data/ must be wiped by the caller
  // *before* starting `npm run dev:all`. The fixture seeder uses
  // deterministic credentials; rerunning against a populated DB hits
  // duplicate-email errors on sign-up. See Phase 2 Task 2.1 Step 1.

  const browser = await chromium.launch();
  const manifest: ManifestEntry[] = [];
  const stateCache = new Map<string, Substitutions>();
  const capturedAt = new Date().toISOString();

  try {
    for (const surface of SURFACES) {
      // Seed once per state; cache the substitutions for re-use across
      // viewports of the same surface.
      let subs = stateCache.get(surface.state);
      if (!subs) {
        const seedContext = await browser.newContext({ baseURL: BASE_URL });
        subs = await seedState(seedContext, surface.state);
        stateCache.set(surface.state, subs);
        await seedContext.close();
      }

      for (const viewport of VIEWPORTS) {
        const ctx = await browser.newContext({
          baseURL: BASE_URL,
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          // Re-establish auth state. Seeding is per-state, capture is
          // per-(state, viewport) — we create a fresh context but reuse
          // the same backing cookies via storageState if the seed wrote
          // any. For Phase A we just re-seed lightly to keep this simple.
        });
        // Re-seed cheaply (sign back in if needed).
        if (surface.state !== "anonymous") {
          await seedState(ctx, surface.state);
        }
        const page = await ctx.newPage();
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(applySubs(surface.route, subs));
        if (surface.waitFor) {
          await page.waitForSelector(surface.waitFor, { state: "visible" });
        }
        if (surface.modalTrigger) {
          await page.click(surface.modalTrigger);
          // Best-effort wait — modal animation disabled by reducedMotion.
          await page.waitForTimeout(150);
        }

        const file = `${surface.id}--${viewport.name}.png`;
        await page.screenshot({
          path: resolve(OUTPUT_DIR, file),
          fullPage: false,
          animations: "disabled",
          caret: "hide",
        });
        manifest.push({
          id: surface.id,
          route: surface.route,
          state: surface.state,
          viewport: viewport.name,
          file,
          capturedAt,
        });
        await ctx.close();
        console.log(`captured: ${file}`);
      }
    }
  } finally {
    await browser.close();
  }

  writeFileSync(
    resolve(OUTPUT_DIR, "manifest.json"),
    JSON.stringify({ capturedAt, surfaces: manifest }, null, 2) + "\n",
  );
  console.log(`\n${manifest.length} screenshots written to ${OUTPUT_DIR}`);
}

function applySubs(route: string, subs: Substitutions): string {
  let out = route;
  if (subs.meId) out = out.replace(":meId", subs.meId);
  if (subs.bobId) out = out.replace(":bobId", subs.bobId);
  if (subs.convId) out = out.replace(":convId", subs.convId);
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Sanity-check it compiles**

```bash
npx tsc --noEmit scripts/audit/capture-screens.ts scripts/audit/fixtures.ts scripts/audit/surfaces.ts scripts/audit/routes.ts
```

Expected: no TS errors.

### Task 1.5: npm script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the script**

Insert under `scripts`:

```json
"audit:capture": "tsx scripts/audit/capture-screens.ts",
```

Place it just above `"check-tokens"` for proximity to other one-shot tooling.

- [ ] **Step 2: Verify tsx is available**

```bash
npx tsx --version
```

Expected: a version number. `tsx` is already used by `scripts/api.sh`; if it's not resolvable from the repo root, prefix the npm script with `npx ` instead:

```json
"audit:capture": "npx tsx scripts/audit/capture-screens.ts",
```

### Task 1.6: Commit Phase 1

```bash
git add scripts/audit/ package.json
git commit -m "feat(audit): unit-8 phase-a capture toolkit

scripts/audit/:
  - surfaces.ts: canonical catalog of capturable surface variants
  - fixtures.ts: UI-driven deterministic state seeder (alice/bob test
    accounts, share-link invite for 1:1, group for many)
  - routes.ts: coverage check — every <Route path=…> in App.tsx must be
    exercised by at least one surface
  - capture-screens.ts: orchestrator; emits PNGs + manifest to
    docs/superpowers/audit/unit-8/live/

Run: npm run audit:capture (requires npm run dev:all running).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2 · First-pass capture

### Task 2.1: Wipe state + run capture

**Files:**
- Created: `docs/superpowers/audit/unit-8/live/<id>--{desktop,mobile}.png` (many)
- Created: `docs/superpowers/audit/unit-8/live/manifest.json`

- [ ] **Step 1: Wipe stale local state**

```bash
# Stop dev:all if running.
rm -f api/auth.sqlite
rm -rf .jazz-data/
```

The api SQLite holds prior sign-ups; the sync server's `.jazz-data` holds prior CoValues. Both must reset so the deterministic credentials in `fixtures.ts` can sign up cleanly.

- [ ] **Step 2: Boot dev:all**

In one terminal:

```bash
npm run dev:all
```

Wait for `api service listening on :4300`, `COJSON sync server listening on ws://0.0.0.0:4200`, and `VITE v8.0.13 ready`.

- [ ] **Step 3: Run capture**

In another terminal:

```bash
npm run audit:capture
```

Expected output ends with `N screenshots written to docs/superpowers/audit/unit-8/live`. If any surface fails (selector not found, navigation timeout), fix the surface entry or fixture and re-run.

- [ ] **Step 4: Spot-check the output**

```bash
ls docs/superpowers/audit/unit-8/live/ | head -10
cat docs/superpowers/audit/unit-8/live/manifest.json | python3 -m json.tool | head -30
```

Expected: PNGs present, manifest valid JSON.

### Task 2.2: Commit captured PNGs + manifest

```bash
git add docs/superpowers/audit/unit-8/live/
git commit -m "audit(unit-8): phase-a first-pass screenshot capture

$(ls docs/superpowers/audit/unit-8/live/*.png | wc -l) PNGs covering
27 surface variants at 1440×900 + 375×812. Generated by
\`npm run audit:capture\` against the live app (post-Units 1/2/3-fu/4).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

If captures need re-running later (Phase C), commit the regenerated PNGs as a new commit so the audit doc history is reviewable.

---

## Phase 3 · Audit doc — three-way reconciliation

The audit doc is multimodal work — each row requires comparing a live PNG against design references (HTML, JSX source, screenshots in `design/`). This phase is broken by surface area so each task is independently completable.

### Task 3.1: Audit doc skeleton + tokens diff

**Files:**
- Create: `docs/superpowers/specs/2026-06-13-unit-8-audit.md`

- [ ] **Step 1: Write the skeleton**

```markdown
# Unit 8 — Phase A audit

Generated 2026-06-13. Live screenshots: `docs/superpowers/audit/unit-8/live/`.
Reference: `design/` (extracted from `ArcanUI.zip`).

Reconciliation rules and row schema defined in
`docs/superpowers/specs/2026-06-13-unit-8-final-alignment-design.md`.

---

## Summary

- Total surface variants captured: TBD
- Rows by status:
  - match: TBD
  - partial: TBD
  - gap: TBD
  - unreferenced: TBD
- Rows by severity (worst delta per row):
  - block: TBD
  - fix: TBD
  - nit: TBD
  - defer: TBD

Phase B sub-unit assignments are summarised at the bottom.

---

## Tokens diff

`src/styles/tokens.css` vs `design/nox-tokens.css`. Any value mismatch becomes
a top-of-list row; resolving these fixes most downstream colour / typography
deltas with a single edit.

| Token | Live | Design | Action |
|---|---|---|---|
| TBD | TBD | TBD | TBD |

---

## Audit rows

### Auth + onboarding

(rows go here)

### Conversations

(rows go here)

### Contacts + profile

(rows go here)

### Connections

(rows go here)

### Settings

(rows go here)

### Modals

(rows go here)

---

## Unreferenced surfaces — self-authored adjustments

Live surfaces with no design counterpart. Each row proposes a treatment
derived from the design language (tokens + existing primitives). User
approves the adjustments here before Phase B picks them up.

(rows go here)

---

## Phase B sub-unit work-list

Cross-cuts the rows above. Each row's `proposed_action` references one of:

- **8a** — AuthSurface
- **8b** — EmptyPane + Lattice placement
- **8c** — Modal shell
- **8d** — Mobile chrome + sidebar separation
- **8e** — Toast + skeleton call-sites
- **8f** — Unreferenced surfaces

| Sub-unit | Rows | Severity high-water-mark |
|---|---|---|
| TBD | TBD | TBD |
```

- [ ] **Step 2: Populate the tokens diff section**

Compare token by token:

```bash
diff -u src/styles/tokens.css design/nox-tokens.css | head -100
```

For every CSS custom property that differs (value, presence, name), add a row to the **Tokens diff** table with `Action`: either `adopt design value` (default) or `keep live value` (with justification — e.g. live has been informed by user feedback). Mark rows whose action is `adopt design value` as the bulk of the token fix work; this can land as a single-commit prep task before any Phase B sub-unit dispatches.

### Task 3.2: Auth + onboarding rows

For each of `auth-login`, `auth-recovery`, `onboarding` (× 2 viewports each):

- [ ] **Step 1: Open the live PNG**

`docs/superpowers/audit/unit-8/live/auth-login--desktop.png` (then mobile, then next surface).

- [ ] **Step 2: Open the references**

- `design/Jazz Hi-Fi App.html` — find the sign-in scene (search for "sign in" or scroll the rendered preview)
- `design/Arcan Prototype.html` — find the auth scene
- `design/hf-flows.jsx` — auth-related scene exports
- `design/screenshots/` — any `01-bs.png` / `01-proto-*.png` matching auth

- [ ] **Step 3: Write the row**

```yaml
- id: AUDIT-001
  phase: A
  route: /auth/login
  viewport: desktop
  status: <match|partial|gap|unreferenced>
  live: live/auth-login--desktop.png
  reference:
    - design/Jazz Hi-Fi App.html#<anchor or scene>
    - design/Arcan Prototype.html#<anchor>
    - design/hf-flows.jsx
  deltas:
    - category: <layout|spacing|typography|color|iconography|copy|motion>
      severity: <block|fix|nit|defer>
      description: <exactly what is different>
      source: <which reference(s) the delta is measured against>
  proposed_action: <one of 8a/8b/8c/8d/8e/8f, plus brief why>
```

Repeat for the mobile variant. The two viewports may produce different deltas (e.g. desktop matches but mobile is missing safe-area handling).

- [ ] **Step 4: Append to the doc**

In the `### Auth + onboarding` section. Keep rows numbered sequentially across the whole doc (AUDIT-001, AUDIT-002, …).

### Task 3.3: Conversations rows

Same workflow as Task 3.2 for the conversations cluster:

- `conv-list-empty`, `conv-list-1to1`, `conv-list-group`
- `conv-detail-1to1`, `conv-detail-group`
- `conv-members-group`
- `conv-new`

References:

- `design/Jazz Hi-Fi App.html`, `design/Jazz Hi-Fi Chat.html`
- `design/hf-chat.jsx`, `design/hf-list.jsx`, `design/hf-convo-settings.jsx`
- `design/screenshots/01-proto-chats.png`, `01-proto-desktop.png`, any chat-* shots

Append rows under `### Conversations`.

### Task 3.4: Contacts + profile rows

Surfaces: `contacts-list`, `contacts-add`, `profile-own`, `profile-other`.

References: `design/hf-contacts.jsx`, `design/Arcan Prototype.html` (contact + profile scenes), any matching `design/screenshots/`.

Append rows under `### Contacts + profile`.

### Task 3.5: Connections rows

Surfaces: `connections-pending-empty`, `connections-pending`, `connections-live-invites-empty`, `connections-live-invites`.

References: `design/hf-extra.jsx` (likely), `design/Arcan Prototype.html` (connection-request scenes).

Append rows under `### Connections`.

### Task 3.6: Settings rows

Surfaces: `settings-root`, `settings-account`, `settings-devices`, `settings-appearance`, `settings-notifications`, `settings-feedback`.

References: `design/hf-settings.jsx`, `design/Jazz Hi-Fi App.html` settings scene, any matching `design/screenshots/`.

Append rows under `### Settings`.

### Task 3.7: Modal rows

Surfaces: `modal-change-password`, `modal-view-recovery-code`, `modal-pair-qr`.

References: `design/hf-polish.jsx` (modal shells likely live here), `design/Arcan Prototype.html` (modal scenes).

Append rows under `### Modals`.

### Task 3.8: Unreferenced section

Walk the row list. For every row marked `status: unreferenced`:

- [ ] **Step 1: Write the self-authored treatment**

In the row's `proposed_action_self_authored` field, describe what to apply, using only the design language's vocabulary:

```yaml
proposed_action_self_authored: |
  Apply shared AuthSurface shell (sub-unit 8a) since this is an auth-flow
  screen with no design counterpart. Adopt the Card width (~300px) used
  by the design's sign-in scene. Swap inline "Loading…" for
  <Skeleton variant="block"> (sub-unit 8e).
```

Each treatment must reference existing primitives or tokens — no new components invented at audit time.

- [ ] **Step 2: Append the consolidated section**

In the doc's `## Unreferenced surfaces — self-authored adjustments` section, list each unreferenced row with its proposed treatment + before/after stub:

```markdown
### AUDIT-NNN · /settings/notifications (desktop)

**Live:** `live/settings-notifications--desktop.png`

**Proposed treatment:** Apply Card layout from `design/hf-settings.jsx`'s
appearance section (header + hairline + content padding 16px); swap
inline status text for Toast on toggle. Sub-unit 8e.

**Before:** ![](../audit/unit-8/live/settings-notifications--desktop.png)

**After:** _captured during Phase C_
```

### Task 3.9: Populate the Summary + Sub-unit work-list

- [ ] **Step 1: Counts**

At the top of the doc, fill in:

```markdown
- Total surface variants captured: <sum>
- Rows by status:
  - match: <count>
  - partial: <count>
  - gap: <count>
  - unreferenced: <count>
- Rows by severity (worst delta per row):
  - block: <count>
  - fix: <count>
  - nit: <count>
  - defer: <count>
```

- [ ] **Step 2: Sub-unit table**

Group rows by `proposed_action`'s sub-unit letter:

```markdown
| Sub-unit | Rows | Severity high-water-mark |
|---|---|---|
| 8a | 12 | block |
| 8b | 4 | block |
| 8c | 5 | fix |
| 8d | 6 | fix |
| 8e | 18 | fix |
| 8f | 7 | nit |
```

The numbers and severity become the input to Phase B plan authoring after the audit gate.

### Task 3.10: Commit Phase 3

```bash
git add docs/superpowers/specs/2026-06-13-unit-8-audit.md
git commit -m "audit(unit-8): phase-a first-pass audit doc

Categorized-deltas-with-severity inventory across $(ls docs/superpowers/audit/unit-8/live/*.png | wc -l) captured surfaces.
Three-way reconciliation against design/ (hi-fi HTML + prototype + JSX/PNGs).
Unreferenced section lists self-authored adjustments derived from the
design language for surfaces with no design counterpart.

Awaits user review before Phase B sub-unit plans get written.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4 · Hand-off

### Task 4.1: User review prompt

Open the audit doc, present the summary + sub-unit table inline in the chat, and ask the user to walk it. Specifically flag:

- Any `block`-severity rows the user should look at first
- The `unreferenced` section — these are the self-authored adjustments most likely to need user adjustment
- Any rows where references disagreed (hi-fi says one thing, prototype says another) — those need a user decision before Phase B plans get written

### Task 4.2: Iterate

If the user requests changes:

1. Edit the audit doc inline
2. Commit each round of edits with a clear message (`audit(unit-8): incorporate user review pass 1` etc.)
3. Re-present the summary

Continue until the user approves the doc.

### Task 4.3: Merge Phase A back to main

Once approved:

```bash
npm run check-tokens                    # confirm guard still clean
npx tsc -b --noEmit                     # confirm no TS regressions from the scripts/
npx vitest run                          # confirm unit tests still pass

git push -u origin unit-8-phase-a-audit
git checkout main
git merge --no-ff unit-8-phase-a-audit -m "Merge Unit 8 Phase A: audit"
git branch -d unit-8-phase-a-audit
```

Phase A is done. Next step (NOT covered by this plan): invoke `superpowers:writing-plans` six times to produce per-sub-unit Phase B plans (8a–8f), parameterised by the audit rows.

---

## Self-review checklist

- [ ] `design/` extracted from ArcanUI.zip, gitignored.
- [ ] `scripts/audit/` toolkit compiles cleanly (`npx tsc --noEmit`).
- [ ] `npm run audit:capture` produces PNGs + manifest deterministically.
- [ ] Every `<Route path=…>` in `src/App.tsx` is exercised by at least one entry in `SURFACES`.
- [ ] Audit doc has rows for every captured surface variant (desktop + mobile both present).
- [ ] Tokens diff section enumerated.
- [ ] `unreferenced` section populated with self-authored treatments for every `status: unreferenced` row.
- [ ] Summary counts + sub-unit table populated.
- [ ] User has reviewed and approved the doc.
- [ ] Phase A merged to main.
