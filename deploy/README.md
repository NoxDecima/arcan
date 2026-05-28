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
