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

Manual (from the repo root on the VPS):

```bash
git checkout main   # CI deploys leave the clone on a detached tag — see below
git pull
cd deploy && docker compose up -d --build
```

The named `caddy_data` Docker volume persists the issued cert across
rebuilds, so updates don't hit Let's Encrypt's rate limit.

## Automated deploys (CI)

Pushing a `v*` tag deploys this VPS automatically
(`.github/workflows/deploy.yml`); the same tag also builds and publishes the
signed Android APK (`android.yml`). Manual runs: GitHub → Actions → deploy →
Run workflow (deploys whichever branch/tag you pick).

A deploy SSHes in and runs exactly the manual update: `git fetch --tags` →
`git checkout --detach <tag>` → `docker compose up -d --build`, then asserts
all three containers are running and the public origin answers over HTTPS.
On failure the workflow dumps `docker compose ps` + recent logs into the CI
log. **`.env` is never touched by CI** — it stays on this VPS, manually
managed. Rollback = re-run the workflow from the previous good tag.

### Nightly channel

`nightly-*` tags publish a signed pre-release APK for phone testing without
touching prod:

```bash
git tag nightly-YYYY-MM-DD && git push origin nightly-YYYY-MM-DD
```

`android.yml` builds + publishes a GitHub **Pre-release** (never "Latest").
`deploy.yml` does **not** trigger — its filter is `v*` only by design.
The stable release flow (`v*` → APK + VPS deploy) is unchanged.

One-time setup:

1. Generate a dedicated deploy keypair (on your machine, NOT your personal
   key):

   ```bash
   ssh-keygen -t ed25519 -f arcan-deploy -N "" -C "arcan-ci-deploy"
   ```

2. Authorize it on the VPS: append `arcan-deploy.pub` to
   `~/.ssh/authorized_keys`. Optional hardening: prefix the line with
   `restrict,command="..."` to pin the key to the deploy script.
3. Capture the VPS host key once, from a network you trust:

   ```bash
   ssh-keyscan -H <vps-host> 2>/dev/null
   ```

4. GitHub → repo Settings → Secrets and variables → Actions:

   | Name | Kind | Content |
   |---|---|---|
   | `VPS_SSH_KEY` | secret | contents of the `arcan-deploy` private key file |
   | `VPS_HOST` | secret | VPS hostname or IP |
   | `VPS_USER` | secret | SSH user owning the clone |
   | `VPS_KNOWN_HOSTS` | secret | the `ssh-keyscan` output from step 3 |
   | `VPS_APP_DIR` | variable (optional) | clone path relative to the SSH user's home; default `arcan` |
   | `ARCAN_ORIGIN` | variable | already set for the APK build; reused as the health-check URL |

5. The clone on the VPS must have `origin` pointing at GitHub (it does if you
   followed Quick start).

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

## Android App Links

The Android app opens https://$DOMAIN/invite and /pair links directly. For
Android to verify that, `.well-known/assetlinks.json` must be served from
the web root. The Caddy image bakes it in at build time when the file
exists — create it once and rebuild:

    cp assetlinks.json.example assetlinks.json
    # fill in the release-key SHA256 fingerprint (docs/android-signing.md);
    # fingerprints are public — the file is safe to commit.
    docker compose up -d --build caddy
Verify after deploy: https://$DOMAIN/.well-known/assetlinks.json returns
JSON with content-type application/json.

## Feedback → Linear

The in-app "give feedback" button (settings → give feedback) files issues in
Linear via `POST /api/feedback`. The endpoint only exists when the api
container has a Linear API token:

1. Create a personal API key in Linear (Settings → Security & access →
   Personal API keys).
2. Add it to the VPS's `.env` (CI never writes `.env`, so this is a one-time
   manual step even with automated deploys):

   ```bash
   ssh <user>@<vps-host> 'echo "LINEAR_API_TOKEN=lin_api_…" >> ~/arcan/deploy/.env'
   ```

3. Recreate the api container — either wait for the next `v*` deploy, or
   immediately: `docker compose up -d --build api` (from `~/arcan/deploy`).

Without the token the api boots fine but logs
`LINEAR_API_TOKEN not set — feedback route disabled`, and the app shows
"feedback isn't set up on this server" on submit. Team, project, and label
IDs default to the Nox/Arcan workspace — override them via the commented-out
vars in `.env.example` if you run a fork against another workspace.

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
| App says "feedback isn't set up on this server" | `LINEAR_API_TOKEN` missing from `.env` (or api container not rebuilt since adding it). See § Feedback → Linear. |
