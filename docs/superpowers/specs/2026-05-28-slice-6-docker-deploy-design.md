> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.
# Slice 6 — One-command Caddy + TLS Docker Compose deploy

**Goal.** Ship a self-contained deploy template that turns a Linux VPS + a domain into a working jazz-messanger instance in one `docker compose up` command, with automatic TLS via Let's Encrypt, served from a single domain on a Caddy reverse proxy.

**Scope.** Small-to-medium slice — ~3–5 hours of work, one phase. Pure infrastructure: no schema changes, one small frontend code edit (runtime sync-URL derivation).

**Closes:** the deploy gap from E1a §9.2 (Production deployment) and §7.2 (Production sketch) of the authoritative design.

**Deferred (explicit non-goals for this slice):**
- Backups of `./data/sync.sqlite` and the `caddy_data` volume. Documented but not automated.
- Per-account quotas / abuse heuristics on the sync server.
- Monitoring / alerting / log shipping.
- HA posture, load balancing, secondary sync replicas.
- Docker Compose support for local development (kept on `npm run dev` + `npm run sync`).
- DNS-01 ACME challenge / wildcard certs (HTTP-01 only).
- Per-Dockerfile `.dockerignore` (single root-level `.dockerignore` for both stages).

---

## 1. Architecture

Single VPS runs a 2-container Docker Compose stack:

```
                ┌─────────────────────────────────────┐
   internet     │  caddy  (Caddy 2 + built SPA inside)│ :443, :80
  ─────────────►│                                     │
   wss://       │   /        → static file_server     │
   app.x.com    │   /sync/*  → handle_path → proxy    │
                └──────┬──────────────────────────────┘
                       │ ws://sync:4200/ (docker network)
                ┌──────▼──────────────────────────────┐
                │  sync   (jazz-run sync, SQLite)     │
                └──────┬──────────────────────────────┘
                       │ bind mount
                       ▼
                ./data/sync.sqlite   (on host)
```

- **`caddy`** — multi-stage Dockerfile: stage 1 (`node:22-alpine`) runs `npm ci && npm run build`, stage 2 (`caddy:2-alpine`) has the built `dist/` copied into `/usr/share/caddy`. Caddy serves the SPA from there, reverse-proxies `/sync/*` to the sync container (path prefix stripped), and handles automatic TLS via Let's Encrypt HTTP-01.
- **`sync`** — `node:22-alpine` + `npm install -g jazz-tools`. Runs `jazz-run sync --host 0.0.0.0 --port 4200 --db /data/sync.sqlite`. Listens only on the internal Docker network; **not** exposed on the host.

### 1.1 Single-domain, path-prefixed sync

The browser connects to `wss://{$DOMAIN}/sync/`. Caddy's `handle_path /sync/*` directive strips the `/sync` prefix and reverse-proxies to `ws://sync:4200/`. Caddy's `reverse_proxy` natively handles the WebSocket `Upgrade` handshake — no extra config needed. Jazz's WS protocol is bidirectional frames after the handshake, so no HTTP redirects can carry the wrong path back.

Verified: `jazz-run sync` has no `--path` flag, but doesn't need one — the prefix lives at the reverse-proxy layer.

### 1.2 Runtime sync-URL derivation

`src/jazz/provider.tsx` is edited so that when `VITE_SYNC_URL` is unset (the default), the browser computes its sync URL from `window.location` at runtime: `${wss-if-https-else-ws}://${window.location.host}/sync/`. This makes the built image domain-portable — the same `docker compose up --build` works whether the operator deploys to `chat.foo.com` or `messenger.bar.org`, no rebuild needed for a domain change.

Local dev (`npm run dev` + `npm run sync`) keeps working unchanged because the existing `VITE_SYNC_URL` override still wins when set (e.g., `ws://100.84.74.122:4200` for cross-device Tailscale testing).

---

## 2. Files

All deploy artifacts live in `deploy/`. The repo-root files (`.dockerignore`, `.gitignore`, the existing `.env.example`) are touched lightly.

| Path | Status | Purpose |
|---|---|---|
| `deploy/docker-compose.yml` | NEW | Two services (`caddy` + `sync`); one internal network; `caddy_data` + `caddy_config` named volumes; `./data:/data` bind mount on `sync`; ports `80:80` + `443:443` on `caddy` only. Build contexts reference `..` (repo root) so `npm ci` sees `package.json` + `src/`. Reads `.env` from this directory. |
| `deploy/Dockerfile.caddy` | NEW | Multi-stage: `node:22-alpine` (build) → `caddy:2-alpine` (serve). Stage 2 copies the built `dist/` to `/usr/share/caddy` and `Caddyfile` to `/etc/caddy/Caddyfile`. |
| `deploy/Dockerfile.sync` | NEW | Single-stage `node:22-alpine`. `RUN npm install -g jazz-tools`. CMD runs `jazz-run sync --host 0.0.0.0 --port 4200 --db /data/sync.sqlite`. |
| `deploy/Caddyfile` | NEW | One site block for `{$DOMAIN}`. Routes: `handle_path /sync/* { reverse_proxy sync:4200 }`, then `handle { root * /usr/share/caddy; try_files {path} /index.html; file_server }`. `tls {$ACME_EMAIL}` for ACME registration. |
| `deploy/.env.example` | NEW | `DOMAIN=` + `ACME_EMAIL=` template. Separate from the repo-root `.env.example` (which stays for local dev: `VITE_SYNC_URL`, `SYNC_HOST`, `SYNC_PORT`). |
| `deploy/README.md` | NEW | One-page operator guide: domain + DNS, install Docker, `cd deploy && cp .env.example .env && docker compose up -d --build`. Notes port 80 must be reachable for HTTP-01, the `caddy_data` volume must persist, etc. |
| `deploy/data/` | NEW (gitignored) | Bind-mount target for the SQLite file. Created by compose on first run. |
| `.dockerignore` | NEW | At **repo root** — Docker reads it from the build context root, which `deploy/docker-compose.yml` sets to `..`. Excludes `node_modules`, `tests/`, `.vite/`, `dist/`, `.env*`, `.jazz-data/`, `deploy/data/`. |
| `src/jazz/provider.tsx` | Modify | ~5-line edit for runtime `window.location`-based sync-URL derivation when `VITE_SYNC_URL` is unset. |
| `tests/unit/jazz/provider.test.ts` | NEW | Two-three unit tests covering: `VITE_SYNC_URL` override wins; `window.location` derivation picks `wss://` over HTTPS and `ws://` over HTTP; falls back to `ws://localhost:4200` when `window` is undefined. |
| `.gitignore` | Modify | Add `deploy/data/` and `deploy/.env`. |
| `CHANGELOG.md` | Modify | Slice 7 entry. |

---

## 3. Caddyfile content

```caddyfile
{$DOMAIN} {
    encode zstd gzip

    # WebSocket sync — strip /sync prefix, then reverse-proxy to the sync container.
    # Caddy handles the WS Upgrade handshake natively; no extra config needed.
    handle_path /sync/* {
        reverse_proxy sync:4200
    }

    # SPA — serve built static assets with a client-side router fallback to index.html.
    handle {
        root * /usr/share/caddy
        try_files {path} /index.html
        file_server
    }

    # Operator-visible access log; no PII beyond IP + path.
    log {
        output stdout
        format console
    }

    tls {$ACME_EMAIL}
}
```

HTTP→HTTPS redirect is automatic when a site block names a public domain.

---

## 4. docker-compose.yml shape

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
    # NOT exposed on the host — internal network only.

volumes:
  caddy_data:
  caddy_config:
```

Notes:
- The sync service has **no `ports:` block** — reachable only from `caddy` over the default Compose network.
- `caddy_data` is a named Docker volume (not a bind mount) because Caddy expects to manage its own filesystem layout under `/data`; bind-mounting to the host is fragile across Caddy upgrades and a frequent source of cert-reissue loops.
- The SQLite file uses a bind mount (`./data:/data`) because it's a single discrete file the operator may want to `cp`/`scp`/inspect manually.

---

## 5. `provider.tsx` edit

```ts
function deriveDefaultSyncURL(): `ws://${string}` | `wss://${string}` {
  if (typeof window === "undefined") return "ws://localhost:4200";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/sync/`;
}

const SYNC_URL =
  (import.meta.env.VITE_SYNC_URL as `ws://${string}` | `wss://${string}` | undefined) ??
  deriveDefaultSyncURL();
```

Behavior matrix:

| Scenario | `VITE_SYNC_URL` | Resolved URL |
|---|---|---|
| Local dev (no env) | unset | `ws://localhost:4200` (matches current default) |
| Local dev (Tailscale) | `ws://100.84.74.122:4200` | matches env override |
| Built image deployed on `chat.foo.com` over HTTPS | unset | `wss://chat.foo.com/sync/` |
| Built image deployed locally on `localhost:8080` over HTTP | unset | `ws://localhost:8080/sync/` |

The `typeof window === "undefined"` guard preserves SSR-friendliness (currently unused but trivial to keep).

---

## 6. Operator docs (`deploy/README.md` outline)

One page. Sections:

- **Prerequisites** — Linux VPS (1 vCPU / 1 GB RAM is plenty), domain with A record pointing at the VPS, ports 80 + 443 reachable from the internet, Docker 23+ and Compose v2.
- **Quick start** — `git clone … && cd jazz-messanger/deploy && cp .env.example .env && (edit DOMAIN + ACME_EMAIL) && docker compose up -d --build`. First run takes 1–2 minutes (Vite build + Caddy pulling its image).
- **Verifying** — `docker compose ps` (both running), `curl -I https://$DOMAIN` (200), `docker compose logs caddy` ("certificate obtained").
- **Updates** — `git pull && docker compose up -d --build`.
- **Data on disk** — `./data/sync.sqlite` is the conversation state (back this up if it matters). `caddy_data` named Docker volume holds the TLS certs + ACME state (do **not** delete casually; risks Let's Encrypt rate limit).
- **Troubleshooting** — "no such host" → DNS A record not propagated; "challenge failed" → port 80 not reachable; mixed-content warnings → `VITE_SYNC_URL` is hardcoded to `ws://` somewhere.

---

## 7. Phases

This is a one-phase slice — the artifacts are coupled and there's no incremental milestone where "half" of it is useful.

- **Phase A — All deploy artifacts** (~7 tasks):
  1. `provider.tsx` runtime-URL derivation + unit test.
  2. `deploy/Dockerfile.caddy` (multi-stage build).
  3. `deploy/Dockerfile.sync`.
  4. `deploy/Caddyfile`.
  5. `deploy/docker-compose.yml` + `deploy/.env.example`.
  6. `.dockerignore` at repo root + `.gitignore` additions.
  7. `deploy/README.md` + CHANGELOG entry + smoke-test (`docker compose config` validates, `docker compose build` succeeds).

---

## 8. Acceptance criteria

1. `docker compose build` from `deploy/` completes without errors.
2. `docker compose config` validates the rendered spec.
3. `docker compose up -d` starts both containers; `docker compose ps` shows both healthy.
4. On a real domain pointing at the host, `https://$DOMAIN` serves the SPA over a valid Let's Encrypt cert.
5. The browser connects to `wss://$DOMAIN/sync/` and a created account syncs (verified by reload-and-see-state-persists).
6. The same built image works on a different domain by just changing `.env` + restarting — no rebuild.
7. `./data/sync.sqlite` exists on the host after the first sync write.
8. Stopping + restarting compose preserves the cert and the SQLite state.
9. All Slice 1–5 regression tests still pass (the `provider.tsx` change is the only code touched).

---

## 9. Risks

- **Let's Encrypt rate limit.** A misconfigured deploy looping on `up --build` could exhaust the cert-issuance quota for the domain (50/week per registered domain). Mitigation: the `caddy_data` named volume persists across rebuilds, so certs are reused unless the volume is deleted. `deploy/README.md` explicitly warns against deleting it.
- **Path-prefix collision.** If a future spec adds a frontend route at `/sync/*`, it would be shadowed by the reverse proxy. Mitigation: `deploy/README.md` documents `/sync/` as a reserved path. Easy to refactor (rename to `/jazz-sync/*` or split to a subdomain) when needed.
- **WebSocket proxying buffering.** Caddy's default `reverse_proxy` is WS-aware and doesn't buffer. No known issue, but worth a smoke test on a slow link.
- **First-run build time.** `npm ci && vite build` inside the Caddy image stage takes ~60–90 s on a small VPS. Acceptable for a deploy that runs maybe weekly; documented.
- **`window.location.host` includes the port for non-standard ports.** When a user reverse-proxies through their own gateway that uses e.g. `:8443`, the derived WS URL will include the port. Correct behavior; documented in the doc-comment on `deriveDefaultSyncURL`.

---

## 10. Open questions resolved during brainstorming

- **Q1 — single vs split domains.** Single domain, path-prefixed `/sync/` (option A). Caddy handles the prefix strip; jazz-run sync stays on its root URL.
- **Q2 — frontend serving.** Caddy-as-multi-stage-build (option C). The Vite build runs inside the Caddy image's first stage; the second stage serves the resulting `dist/`.
- **Q3 — sync URL knowledge.** Runtime derivation from `window.location` (option B). Built image is domain-portable.
- **Q4 — local dev parity.** Compose is prod-only (option A). Local dev keeps the existing `npm run dev` + `npm run sync` workflow.

---

## 11. Followups (deferred from this slice)

- **Backups of `./data/sync.sqlite` and `caddy_data`.** Specced at a high level in E1a §7.2 (weekly encrypted snapshots, off-site object storage, 4-week retention). Out of scope here.
- **Quota / abuse heuristics on the sync server.** Specced in E1a §10. Out of scope for the first deploy.
- **Monitoring / log shipping.** No structured observability in this slice; `docker compose logs` is the operator's tool.