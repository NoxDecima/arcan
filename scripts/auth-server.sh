#!/usr/bin/env bash
# scripts/auth-server.sh — start ONLY the auth-server for local dev.
#
# Mirrors the npm run sync / npm run dev split: this script starts the
# Better Auth + jazzZkPlugin Node service in isolation, so you can run it
# in its own terminal alongside `npm run sync` and `npm run dev`.
#
# Usage: npm run auth
#
# Env knobs:
#   BETTER_AUTH_SECRET       Session-signing secret. If unset, a random
#                            per-run value is generated (sign-ups from
#                            previous runs become unverifiable). Set to a
#                            persistent value in your shell rc to keep
#                            local accounts alive across restarts.
#   BETTER_AUTH_URL          The canonical /api/auth base URL Better Auth
#                            uses for cookie scoping and trust. Defaults
#                            to http://localhost:5173/api/auth (assumes
#                            you're hitting the app via Vite's dev proxy).
#   PORT                     Auth-server listen port. Default: 4300.
#   AUTH_RATE_LIMIT_MAX      Max requests per window per IP+email.
#                            Default for local dev: 1000 (raised from the
#                            production default of 5 so e2e-style rapid
#                            testing doesn't trip 429s).
#   AUTH_RATE_LIMIT_WINDOW   Rate-limit window in seconds. Default: 60.
#   BETTER_AUTH_TRUSTED_ORIGINS
#                            Comma-separated allowlist of origins Better
#                            Auth treats as trusted for CSRF / OAuth
#                            callback purposes. Default trust covers the
#                            BETTER_AUTH_URL origin; add tailnet HTTPS
#                            origins here when accessing via Tailscale
#                            Serve. dev-all.sh sets this automatically.
#                            Read natively by Better Auth (no code change).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  export BETTER_AUTH_SECRET="dev-$(head -c 24 /dev/urandom | base64 | tr -d /+=)"
fi
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:5173/api/auth}"
export PORT="${PORT:-4300}"
export AUTH_RATE_LIMIT_MAX="${AUTH_RATE_LIMIT_MAX:-1000}"
export AUTH_RATE_LIMIT_WINDOW="${AUTH_RATE_LIMIT_WINDOW:-60}"

# Map the shared ALLOWED_ORIGINS env var into Better Auth's native
# BETTER_AUTH_TRUSTED_ORIGINS unless the caller set the latter explicitly.
# BA reads BETTER_AUTH_TRUSTED_ORIGINS natively from process.env at
# getTrustedOrigins() time — comma-separated origins. Same format as
# ALLOWED_ORIGINS, so straight pass-through.
if [ -z "${BETTER_AUTH_TRUSTED_ORIGINS:-}" ] && [ -n "${ALLOWED_ORIGINS:-}" ]; then
  export BETTER_AUTH_TRUSTED_ORIGINS="$ALLOWED_ORIGINS"
fi

cd "$REPO_ROOT/auth-server"
exec npx tsx src/index.ts
