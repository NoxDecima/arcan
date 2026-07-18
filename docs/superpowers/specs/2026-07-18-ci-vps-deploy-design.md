# CI VPS deploy — design

Date: 2026-07-18
Status: approved (user request, 2026-07-18)

## Context

Releases are now CI-driven: pushing an `android-v*` tag builds and publishes the
signed APK via `.github/workflows/android.yml`. The VPS (Caddy + sync + api via
Docker Compose) is still updated manually per `deploy/README.md` (`git pull` +
`docker compose up -d --build`). The user wants tag-driven VPS deploys, and a
tag-convention change: general `v*` tags drive BOTH the APK release and the VPS
deploy.

Decisions (user-confirmed):
- Trigger: `v*` tags + manual `workflow_dispatch`. Not per-push CD.
- Mechanism: SSH into the VPS and run the documented update (remote build).
  No GHCR image pipeline.
- Secrets: the VPS `.env` stays VPS-local and manually managed; CI never
  touches it.

## New workflow `.github/workflows/deploy.yml`

- `on: push: tags: ["v*"]` + `workflow_dispatch` (deploys `github.ref_name` —
  the tag, or the branch/tag chosen in the dispatch UI).
- `concurrency: group: deploy, cancel-in-progress: false` — deploys queue and
  are never killed mid-flight. `permissions: contents: read`.
- Steps:
  1. **Configure SSH** — private key from `VPS_SSH_KEY`; pinned host key from
     `VPS_KNOWN_HOSTS` (`StrictHostKeyChecking=yes`; no `ssh-keyscan` at
     deploy time — TOFU is not acceptable against the box hosting an E2EE
     messenger). Loud `::error::` failures when secrets are missing.
  2. **Update VPS** — remote script over SSH (`set -euo pipefail`, args passed
     with `printf %q`): `git fetch --tags --prune origin`,
     `git checkout --detach <ref>`, `cd <app-dir>/deploy`,
     `docker compose up -d --build` (run from `deploy/` — the compose file
     uses relative bind mounts), then assert ≥3 services running
     (`docker compose ps --status running --quiet | wc -l`).
  3. **Health check** — retry loop (12 × 10 s) curling `${ARCAN_ORIGIN}/`
     expecting success; reuses the existing `ARCAN_ORIGIN` repo variable.
  4. **Failure forensics** — `if: failure()`: SSH back in and dump
     `docker compose ps` + `docker compose logs --tail 50` into the CI log.

## `android.yml` changes

- Tag filter: `["android-v*"]` → `["v*", "android-v*"]` (new convention `v*`;
  old pattern kept as a forgiving alias — an `android-v*` tag builds the APK
  only and does not deploy the VPS).
- The three release-gating conditions `startsWith(github.ref,
  'refs/tags/android-v')` become `startsWith(github.ref, 'refs/tags/')` —
  equivalent given the workflow's tag filters.

## Configuration (GitHub → Settings → Secrets and variables → Actions)

| Name | Kind | Content |
|---|---|---|
| `VPS_SSH_KEY` | secret | dedicated ed25519 deploy-only private key |
| `VPS_HOST` | secret | VPS hostname/IP |
| `VPS_USER` | secret | SSH user |
| `VPS_KNOWN_HOSTS` | secret | one-time `ssh-keyscan -H <host>` output, captured from a trusted network |
| `VPS_APP_DIR` | variable, optional | repo path relative to the SSH user's home; default `arcan` |
| `ARCAN_ORIGIN` | variable, exists | health-check URL base |

## Docs

`deploy/README.md` gains "Automated deploys (CI)": keypair generation,
authorized_keys (with optional `command=` forced-command hardening note),
host-key capture, secret/variable table, what a deploy does, the note that
manual `git pull` updates now require `git checkout main` first (CI leaves the
VPS clone on a detached tag), rollback = re-run the workflow from the previous
good tag, and the one-time `LINEAR_API_TOKEN` append to the VPS `.env`.

## Out of scope

- GHCR image builds; `.env` templating from GitHub secrets; automated
  rollback; per-push continuous deployment.

## Verification

- Workflow YAML parse-validated locally. The end-to-end test is the next `v*`
  tag push — the job fails loudly and diagnosably (forensics step) rather than
  half-deploying silently.
