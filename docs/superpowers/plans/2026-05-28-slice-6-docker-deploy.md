# Slice 6 — Caddy + TLS Docker Compose Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a self-contained `deploy/` template that turns a Linux VPS + a domain into a working jazz-messanger instance via one `docker compose up` command, with automatic TLS via Let's Encrypt.

**Architecture:** Two-container Docker Compose stack — Caddy serves the built SPA + reverse-proxies `/sync/*` to a Jazz sync container — both built from multi-stage Dockerfiles. One small frontend code edit makes the built image domain-portable by deriving its sync URL from `window.location` at runtime when `VITE_SYNC_URL` isn't set.

**Tech Stack:** Docker 23+, Docker Compose v2, Caddy 2, Node 22 (Alpine), jazz-tools, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-28-slice-6-docker-deploy-design.md`

**Critical reminders for every task:**
- All deploy artifacts live in `deploy/`. The `.dockerignore` stays at **repo root** because `deploy/docker-compose.yml` sets `context: ..` for both builds.
- `provider.tsx` edit must preserve the `VITE_SYNC_URL` override (it wins when set). Add a `typeof window === "undefined"` guard for SSR-safety.
- Vitest is scoped to `tests/unit/**`. Mock `window.location` via `vi.stubGlobal`.
- Modern Caddy 2 `reverse_proxy` is WebSocket-aware automatically — no extra `header_up Upgrade …` config needed.
- `caddy_data` is a **named Docker volume** (not bind mount — fragile across Caddy upgrades). The SQLite file uses a **bind mount** (`./data:/data`) so the operator can `scp`/inspect manually.
- The sync service has **no `ports:` block** — internal Docker network only.

---

## File structure

| Status | Path | Responsibility |
|---|---|---|
| Modify | `src/jazz/provider.tsx` | Runtime sync-URL derivation from `window.location` when `VITE_SYNC_URL` unset |
| NEW | `tests/unit/jazz/provider.test.ts` | Unit tests for the derivation matrix in spec §5 |
| NEW | `deploy/docker-compose.yml` | Two services + named volumes + bind mount |
| NEW | `deploy/Dockerfile.caddy` | Multi-stage: Vite build → Caddy serves |
| NEW | `deploy/Dockerfile.sync` | Single-stage: jazz-tools + jazz-run sync |
| NEW | `deploy/Caddyfile` | `{$DOMAIN}` site block, path-prefixed `/sync/*` proxy |
| NEW | `deploy/.env.example` | `DOMAIN` + `ACME_EMAIL` template |
| NEW | `deploy/README.md` | One-page operator guide |
| NEW | `.dockerignore` | At repo root — excludes node_modules, tests, .env*, etc. |
| Modify | `.gitignore` | Add `deploy/data/` and `deploy/.env` |
| Modify | `CHANGELOG.md` | Slice 6 entry |

---

## Phase A — All deploy artifacts

The slice is small enough that all 7 tasks belong in one phase. Sequence them so Task 1 (the only code change) lands first; the rest are file-creation only.

### Task 1: Runtime sync-URL derivation in `provider.tsx` + unit tests

**Files:**
- Modify: `src/jazz/provider.tsx`
- Create: `tests/unit/jazz/provider.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/jazz/provider.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for the sync-URL derivation in provider.tsx.
 *
 * The derivation is exported as a stand-alone helper so it can be tested
 * without rendering the JazzReactProvider (which would require a Jazz peer).
 */
import { deriveDefaultSyncURL } from "@/jazz/provider";

describe("deriveDefaultSyncURL", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ws://localhost:4200 when window is undefined (SSR-safe)", () => {
    vi.stubGlobal("window", undefined);
    expect(deriveDefaultSyncURL()).toBe("ws://localhost:4200");
  });

  it("returns wss://<host>/sync/ when the page is loaded over HTTPS", () => {
    vi.stubGlobal("window", {
      location: { protocol: "https:", host: "chat.example.com" },
    });
    expect(deriveDefaultSyncURL()).toBe("wss://chat.example.com/sync/");
  });

  it("returns ws://<host>/sync/ when the page is loaded over HTTP", () => {
    vi.stubGlobal("window", {
      location: { protocol: "http:", host: "localhost:8080" },
    });
    expect(deriveDefaultSyncURL()).toBe("ws://localhost:8080/sync/");
  });

  it("preserves a non-standard port in the host when present", () => {
    vi.stubGlobal("window", {
      location: { protocol: "https:", host: "messenger.bar.org:8443" },
    });
    expect(deriveDefaultSyncURL()).toBe("wss://messenger.bar.org:8443/sync/");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- provider.test`
Expected: FAIL — `Cannot find name 'deriveDefaultSyncURL'` (or "is not exported").

- [ ] **Step 3: Edit `src/jazz/provider.tsx`**

Replace the file contents with:

```tsx
import { JazzReactProvider } from "jazz-tools/react";
import { JazzMessangerAccount } from "./schema/JazzMessangerAccount";

/**
 * Derive a default sync-server URL from the current page origin.
 *
 * When VITE_SYNC_URL is unset, the built image asks the browser to connect
 * to wss://<host>/sync/ on the same origin it was loaded from. This makes
 * the same Docker image domain-portable — the operator can deploy it to
 * any domain without rebuilding.
 *
 * Edge cases:
 * - SSR / non-browser context: window is undefined; fall back to the
 *   local-dev default so unit tests + node tooling don't crash.
 * - Non-standard ports: window.location.host already includes the port if
 *   the page is served on a non-default one (e.g. "localhost:8080"), so
 *   the resulting URL targets the same port. Correct behaviour for users
 *   who reverse-proxy through their own gateway.
 *
 * Tested in tests/unit/jazz/provider.test.ts.
 */
export function deriveDefaultSyncURL(): `ws://${string}` | `wss://${string}` {
  if (typeof window === "undefined") return "ws://localhost:4200";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/sync/`;
}

/**
 * The WebSocket sync URL.
 *
 * Priority:
 * 1. VITE_SYNC_URL env var (build-time bake) — explicit override wins.
 *    Use this for local dev pointing at a Tailscale IP, or for any deploy
 *    where the sync server lives on a different host than the SPA.
 * 2. window.location-derived default (wss://<host>/sync/) — what the
 *    one-container Docker deploy uses.
 */
const SYNC_URL =
  (import.meta.env.VITE_SYNC_URL as `ws://${string}` | `wss://${string}` | undefined) ??
  deriveDefaultSyncURL();

interface MessangerProviderProps {
  children: React.ReactNode;
}

/**
 * MessangerProvider: top-level Jazz context provider for the application.
 *
 * Wires JazzReactProvider with:
 * - WebSocket sync (VITE_SYNC_URL env var, defaulting to a
 *   window.location-derived URL — see deriveDefaultSyncURL above)
 * - IndexedDB persistence for local-first operation
 * - JazzMessangerAccount as the AccountSchema (activates the migration hook)
 * - A centered "Loading..." fallback shown while the context initialises
 *
 * Place this at the root of the React tree, above all consumers of
 * useAccount / useCoState / usePassphraseAuth.
 */
export function MessangerProvider({ children }: MessangerProviderProps) {
  return (
    <JazzReactProvider
      sync={{ peer: SYNC_URL }}
      AccountSchema={JazzMessangerAccount}
      storage="indexedDB"
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            fontSize: "1.25rem",
            color: "#666",
          }}
        >
          Loading…
        </div>
      }
    >
      {children}
    </JazzReactProvider>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- provider.test`
Expected: PASS — 4/4.

- [ ] **Step 5: Run the full unit suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all existing 107 tests still pass + 4 new ones (= 111 total); `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add src/jazz/provider.tsx tests/unit/jazz/provider.test.ts
git commit -m "feat(jazz): derive default sync URL from window.location"
```

---

### Task 2: `deploy/Dockerfile.caddy` (multi-stage build)

**Files:**
- Create: `deploy/Dockerfile.caddy`

- [ ] **Step 1: Create the Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1
# Stage 1: build the SPA with Vite.
FROM node:22-alpine AS build
WORKDIR /app

# Install deps first so changes to src/ don't bust the npm cache layer.
COPY package.json package-lock.json ./
RUN npm ci

# Bring in the rest of the build context (repo root, scoped by .dockerignore)
# and produce dist/.
COPY . .
RUN npm run build

# Stage 2: Caddy serves the built static files and reverse-proxies /sync/*.
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /usr/share/caddy
```

- [ ] **Step 2: Commit**

```bash
git add deploy/Dockerfile.caddy
git commit -m "chore(deploy): add Caddy multi-stage Dockerfile"
```

---

### Task 3: `deploy/Dockerfile.sync`

**Files:**
- Create: `deploy/Dockerfile.sync`

- [ ] **Step 1: Create the Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine

# jazz-run is the CLI entry point in jazz-tools. Pin the major version so
# unattended docker compose up --build doesn't silently jump to a future
# breaking release.
RUN npm install -g jazz-tools@^0.20.0

# WORKDIR under the bind-mount path so the SQLite file lands in the volume
# regardless of relative-path quirks in jazz-run.
WORKDIR /data

EXPOSE 4200
CMD ["jazz-run", "sync", "--host", "0.0.0.0", "--port", "4200", "--db", "/data/sync.sqlite"]
```

- [ ] **Step 2: Commit**

```bash
git add deploy/Dockerfile.sync
git commit -m "chore(deploy): add sync server Dockerfile"
```

---

### Task 4: `deploy/Caddyfile`

**Files:**
- Create: `deploy/Caddyfile`

- [ ] **Step 1: Create the Caddyfile**

```caddyfile
{$DOMAIN} {
    encode zstd gzip

    # WebSocket sync — strip /sync prefix, reverse-proxy to the sync container.
    # Caddy's reverse_proxy handles the WS Upgrade handshake natively.
    handle_path /sync/* {
        reverse_proxy sync:4200
    }

    # SPA — serve built static assets with a client-side router fallback.
    handle {
        root * /usr/share/caddy
        try_files {path} /index.html
        file_server
    }

    log {
        output stdout
        format console
    }

    tls {$ACME_EMAIL}
}
```

- [ ] **Step 2: Commit**

```bash
git add deploy/Caddyfile
git commit -m "chore(deploy): add Caddyfile with path-prefixed sync proxy"
```

---

### Task 5: `deploy/docker-compose.yml` + `deploy/.env.example`

**Files:**
- Create: `deploy/docker-compose.yml`
- Create: `deploy/.env.example`

- [ ] **Step 1: Create the docker-compose file**

```yaml
services:
  caddy:
    build:
      context: ..
      dockerfile: deploy/Dockerfile.caddy
    restart: unless-stopped
    ports:
      - "80:80"     # HTTP-01 challenge + redirect to HTTPS
      - "443:443"   # HTTPS + WSS
    volumes:
      - caddy_data:/data      # ACME state, issued certs — must persist
      - caddy_config:/config  # Caddy runtime config cache
    environment:
      DOMAIN: ${DOMAIN}
      ACME_EMAIL: ${ACME_EMAIL}
    depends_on:
      - sync

  sync:
    build:
      context: ..
      dockerfile: deploy/Dockerfile.sync
    restart: unless-stopped
    volumes:
      - ./data:/data          # SQLite file on the host for easy inspection / manual backup
    # NOT exposed on the host — internal docker network only.

volumes:
  caddy_data:
  caddy_config:
```

- [ ] **Step 2: Create the env example**

```bash
# Public domain this instance serves (no scheme, no trailing slash).
# Must resolve to this VPS via an A or AAAA record before first
# `docker compose up`, otherwise the Let's Encrypt HTTP-01 challenge fails.
DOMAIN=chat.example.com

# Contact email registered with Let's Encrypt. Used for expiry notifications
# and account recovery if you ever need to revoke certs. Real address please.
ACME_EMAIL=you@example.com
```

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.yml deploy/.env.example
git commit -m "chore(deploy): docker-compose + .env template"
```

---

### Task 6: `.dockerignore` at repo root + `.gitignore` additions

**Files:**
- Create: `.dockerignore`
- Modify: `.gitignore`

- [ ] **Step 1: Create the .dockerignore at repo root**

```gitignore
# Sit at repo root — deploy/docker-compose.yml sets `context: ..` for both
# builds, so Docker reads this from here.

# Node deps — rebuilt inside the image.
node_modules/

# Test artifacts — never needed for the production bundle.
tests/
playwright-report/
test-results/

# Local dev data + caches.
.jazz-data/
.vite/
deploy/data/

# Env files — secrets, not for the image.
.env
.env.*
deploy/.env

# Build output — rebuilt inside the image; would otherwise collide with
# the Caddy stage's COPY /app/dist.
dist/

# Editor + OS noise.
.vscode/
.idea/
.DS_Store

# Docs + source-control metadata don't belong in the image.
.git/
.github/
```

- [ ] **Step 2: Append to .gitignore**

Append the following lines to `.gitignore`:

```gitignore

# Slice 6 — Docker Compose deploy
deploy/data/
deploy/.env
```

- [ ] **Step 3: Verify**

Run: `cat .gitignore | grep deploy`
Expected:
```
deploy/data/
deploy/.env
```

- [ ] **Step 4: Commit**

```bash
git add .dockerignore .gitignore
git commit -m "chore(deploy): .dockerignore at repo root + gitignore deploy/data"
```

---

### Task 7: `deploy/README.md` + smoke test + CHANGELOG

**Files:**
- Create: `deploy/README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Create the operator README**

```markdown
# Deploying jazz-messanger

Single VPS, single domain, automatic TLS via Let's Encrypt. Two containers
(Caddy + the Jazz sync server) running under Docker Compose.

## Prerequisites

- A Linux VPS (1 vCPU / 1 GB RAM is plenty for a small trust circle).
- A domain you control, with an A (or AAAA) record pointing at the VPS's
  public IP.
- Ports 80 and 443 reachable from the internet (port 80 is needed for the
  Let's Encrypt HTTP-01 challenge and stays open for HTTP→HTTPS redirects).
- Docker 23+ and Docker Compose v2 installed.

## Quick start

```bash
git clone <repo> jazz-messanger
cd jazz-messanger/deploy
cp .env.example .env
# edit DOMAIN and ACME_EMAIL
docker compose up -d --build
```

First run takes 1–2 minutes — most of it is `npm ci && npm run build` inside
the Caddy image's build stage. Caddy issues the TLS certificate on first
successful HTTPS request.

## Verifying

```bash
docker compose ps              # both containers should be "running"
curl -I https://$DOMAIN        # 200 OK
docker compose logs caddy      # look for "certificate obtained"
```

Open `https://$DOMAIN` in a browser. The frontend computes its sync URL as
`wss://$DOMAIN/sync/` at runtime — no rebuild is needed when you move the
image to a different host (just update `.env` and restart).

## Updates

```bash
git pull
docker compose up -d --build
```

The named `caddy_data` Docker volume persists the issued cert across
rebuilds, so updates don't hit Let's Encrypt's rate limit.

## Data on disk

- `./data/sync.sqlite` — every conversation's encrypted CoValue state. Back
  this up if you care about not losing message history. Plain file; safe to
  `cp` while the container is stopped.
- Docker volume `caddy_data` — Caddy's issued certs + ACME state. **Don't
  delete this casually**; doing so triggers a full re-issue and risks
  hitting Let's Encrypt's rate limit (50 issuances per registered domain
  per week).

## Reserved URL path

The frontend reserves `/sync/*` for the WebSocket reverse-proxy. Don't
add client-side routes under that prefix — they'll be shadowed by the
proxy. If we ever need that path back, the fix is either renaming the
prefix (e.g. `/jazz-sync/*`) or splitting the sync server to its own
subdomain.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `caddy` logs "no such host" or "DNS lookup failed" | A/AAAA record not propagated yet. Wait + retry. |
| `caddy` logs "HTTP-01 challenge failed" | Port 80 not reachable from the internet. Check firewall and any cloud-provider security group. |
| Browser shows mixed-content warnings | `VITE_SYNC_URL` is hardcoded to `ws://` somewhere. Unset it (or set to `wss://...`) and rebuild. |
| `docker compose ps` shows `sync` restarting | Check `docker compose logs sync`. The bind mount may be on a read-only filesystem, or the SQLite file may be locked from a prior run. |
```

- [ ] **Step 2: Validate compose config + smoke-build**

Run (from the repo root):
```bash
cd deploy && docker compose config > /dev/null && echo "compose config OK"
```
Expected: `compose config OK` printed; no errors.

Run:
```bash
docker compose build
```
Expected: both images build successfully; takes 60–120 seconds depending on cache state.

(If either command fails, fix the underlying file and re-run — don't commit broken artifacts.)

- [ ] **Step 3: Append to CHANGELOG.md under `## [Unreleased]`**

Add this section above the existing Slice 5 entry:

```markdown
### Slice 6 — Caddy + TLS Docker Compose deploy

**Closes:** E1a §9.2 (Production deployment) — minimum viable VPS deploy story.

#### Added

- `deploy/Dockerfile.caddy` — multi-stage build: `node:22-alpine` runs `npm ci && npm run build`, then `caddy:2-alpine` serves the resulting `dist/` from `/usr/share/caddy` and reverse-proxies `/sync/*` to the sync container.
- `deploy/Dockerfile.sync` — `node:22-alpine` + `npm install -g jazz-tools@^0.20.0`; CMD runs `jazz-run sync --host 0.0.0.0 --port 4200 --db /data/sync.sqlite`. Listens only on the internal Docker network; not exposed on the host.
- `deploy/Caddyfile` — one site block for `{$DOMAIN}`. `handle_path /sync/*` strips the prefix before reverse-proxying (Caddy handles the WebSocket `Upgrade` natively). `tls {$ACME_EMAIL}` enables auto-TLS via Let's Encrypt HTTP-01.
- `deploy/docker-compose.yml` — two services + named `caddy_data` and `caddy_config` volumes (cert state must persist across rebuilds) + bind mount `./data:/data` for the SQLite file (operator-inspectable). Sync service has no `ports:` block.
- `deploy/.env.example` — `DOMAIN` + `ACME_EMAIL` template, separate from the repo-root `.env.example` (which stays for local dev).
- `deploy/README.md` — one-page operator guide: prerequisites, quick start, verify, update, on-disk data, reserved path, troubleshooting.
- `.dockerignore` at repo root — excludes `node_modules`, `tests/`, `.vite/`, `dist/`, `.env*`, `.jazz-data/`, `deploy/data/`, etc. Trims the build context for both Dockerfiles.

#### Changed

- `src/jazz/provider.tsx` — when `VITE_SYNC_URL` is unset, the default sync URL is derived at runtime from `window.location` (`wss://<host>/sync/` over HTTPS, `ws://<host>/sync/` over HTTP). Makes the built Docker image domain-portable: the same image works on any domain without rebuild. The existing `VITE_SYNC_URL` override still wins when set (used for local Tailscale dev, etc.).

#### Test coverage

- Unit: +4 tests in `tests/unit/jazz/provider.test.ts` covering the derivation matrix (SSR-undefined window, HTTPS host, HTTP host, non-standard port). 111 total.
- Smoke: `docker compose config` validates; `docker compose build` completes. Full end-to-end run-on-a-real-domain test is operator-side (documented in `deploy/README.md`).

#### Deferred

- Backups of `./data/sync.sqlite` and the `caddy_data` volume — specced at high level in E1a §7.2 (weekly encrypted snapshots, off-site object storage). Out of scope for the first deploy.
- Per-account quotas / abuse heuristics.
- Monitoring / log shipping.
- DNS-01 ACME challenge / wildcard certs.
- Docker Compose support for local development (kept on `npm run dev` + `npm run sync`).
```

- [ ] **Step 4: Commit**

```bash
git add deploy/README.md CHANGELOG.md
git commit -m "docs: Slice 6 deploy README + changelog"
```

- [ ] **Step 5: Hand off to finishing-a-development-branch**

After Task 7 commits, invoke `superpowers:finishing-a-development-branch` with the slice context. It will:
- Verify tests are green (`npm test` should show 111 passing; `tsc --noEmit` clean).
- Present the 4 finishing options.
- (For Option 1 — Merge Locally) merge `slice-6-docker-deploy` to `main` with `--no-ff`, tag `slice-6-complete`, push tag + main + branch.

---

## Self-review

**Spec coverage:**
- §1 architecture (single-domain, path-prefixed sync, two containers) → covered by Tasks 2, 3, 4, 5.
- §1.1 path-prefix detail → `handle_path /sync/*` in Caddyfile (Task 4).
- §1.2 runtime URL derivation → Task 1 (provider.tsx + tests).
- §2 file list → matches the plan's File Structure table at the top.
- §3 Caddyfile content → Task 4 verbatim.
- §4 docker-compose.yml shape → Task 5 verbatim.
- §5 provider.tsx edit (behavior matrix) → Task 1's 4 unit-test cases cover the matrix exactly.
- §6 operator README outline → Task 7.
- §7 phases (one phase, 7 tasks) → matches.
- §8 acceptance criteria 1–8 are operator-side (testable post-deploy on a real domain — documented in README); criterion 9 (regression tests pass) is verified at the end of Task 1 and again in Task 7's hand-off.
- §9 risks → captured in README troubleshooting + reserved-path section.

**Placeholder scan:** no "TBD" / "TODO" / "similar to Task N" patterns. All code blocks are concrete.

**Type consistency:** `deriveDefaultSyncURL` signature returns `\`ws://${string}\` | \`wss://${string}\`` consistently between Task 1's implementation and tests. `DOMAIN` + `ACME_EMAIL` are spelled identically in Caddyfile (Task 4), docker-compose env (Task 5), and .env.example (Task 5). Caddy image is `caddy:2-alpine` in both Dockerfile.caddy (Task 2) and the spec.
