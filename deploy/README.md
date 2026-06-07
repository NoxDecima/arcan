# Deploying Arcan

Single VPS, single domain, automatic TLS via Let's Encrypt. Three containers
(Caddy + the Jazz sync server + the auth server) running under Docker Compose.

## Prerequisites

- A Linux VPS (1 vCPU / 1 GB RAM is plenty for a small trust circle).
- A domain you control, with an A (or AAAA) record pointing at the VPS's
  public IP.
- Ports 80 and 443 reachable from the internet (port 80 is needed for the
  Let's Encrypt HTTP-01 challenge and stays open for HTTP→HTTPS redirects).
- Docker 23+ and Docker Compose v2 installed.

## Quick start

```bash
git clone <repo> arcan
cd arcan/deploy
cp .env.example .env
# edit DOMAIN and ACME_EMAIL, then generate a Better Auth secret:
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env
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
- `./auth-data/auth.sqlite` — Better Auth's user / session / account /
  verification tables, plus each user's encrypted seed envelope. **Loss = every
  user must re-create their account.** Back up alongside `./data/`. The
  encrypted seed envelopes are useless without the user's password (Argon2id +
  AES-GCM), so the file does not leak account secrets on its own.
- Docker volume `caddy_data` — Caddy's issued certs + ACME state. **Don't
  delete this casually**; doing so triggers a full re-issue and risks
  hitting Let's Encrypt's rate limit (50 issuances per registered domain
  per week).

## Reserved URL paths

The frontend reserves the following prefixes for reverse-proxy use; don't
add client-side routes under them, they'll be shadowed by Caddy's handlers.

- `/sync/*` — the Jazz sync WebSocket (proxied to the `sync` container).
- `/api/auth/*` — the Better Auth router (proxied to the `auth` container).
  Cookies are scoped to `/api/auth` by the Better Auth server config.

If we ever need either path back, the fix is renaming the prefix (e.g.
`/jazz-sync/*`) or splitting the relevant service onto its own subdomain.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `caddy` logs "no such host" or "DNS lookup failed" | A/AAAA record not propagated yet. Wait + retry. |
| `caddy` logs "HTTP-01 challenge failed" | Port 80 not reachable from the internet. Check firewall and any cloud-provider security group. |
| Browser shows mixed-content warnings | `VITE_SYNC_URL` is hardcoded to `ws://` somewhere. Unset it (or set to `wss://...`) and rebuild. |
| `docker compose ps` shows `sync` restarting | Check `docker compose logs sync`. The bind mount may be on a read-only filesystem, or the SQLite file may be locked from a prior run. |
| `auth` container exits with "BETTER_AUTH_SECRET must be set" | The `.env` file is missing the secret. Generate one with `openssl rand -base64 32` and add it as `BETTER_AUTH_SECRET=…`. |
| `auth` container restarts on every request | Migration step (in the entrypoint) failed. `docker compose logs auth` will show the underlying SQLite error — usually the bind-mounted `./auth-data/` directory isn't writable by the container user. |
| Sign-up always returns 500 | First-boot migrations didn't run. Re-create the container with `docker compose up -d --build --force-recreate auth` so the entrypoint's migration step runs against a clean DB. |
