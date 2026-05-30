#!/usr/bin/env bash
# Wrapper that runs Better Auth migrations against the auth-server's SQLite
# DB, then execs the auth-server. Used by Playwright e2e to ensure the
# user / session / verification tables exist before any sign-up request hits.
#
# Why this exists: Better Auth's plugin contract declares the schema in
# code, but it doesn't auto-create tables on server boot — the canonical
# path is `npx @better-auth/cli migrate` (or `getMigrations(config).runMigrations()`
# from `better-auth/db/migration`) as a separate ops step. For e2e we want
# a self-contained "spin it up and go" command, so this script does both.
#
# Production deploy: the Dockerfile.auth runs the same migration step on
# container start (see deploy/Dockerfile.auth) so operators don't need an
# extra step either.
#
# Required env vars: BETTER_AUTH_SECRET, BETTER_AUTH_URL
# Optional: DATABASE_URL (default file:./auth.sqlite), PORT (default 4300),
#           AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Run Better Auth migrations against the configured DB.
cd "$REPO_ROOT/auth-server"
npx tsx "$REPO_ROOT/scripts/migrate-auth-server.mjs"

# Exec the server (replaces this shell so signals propagate cleanly).
exec npx tsx src/index.ts
