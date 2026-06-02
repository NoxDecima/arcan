#!/usr/bin/env bash
# scripts/dev-all.sh — one-command local dev: sync + auth + Vite,
# auto-exposed on Tailscale (or localhost-only if Tailscale isn't running).
#
# Usage: npm run dev:all
#
# What it does:
#   1. Detects Tailscale IPv4 if available. If found, sets VITE_SYNC_URL
#      so other devices on your tailnet connect to the right sync server.
#   2. Binds sync (0.0.0.0:4200) + auth (0.0.0.0:4300) + Vite (--host)
#      so the SPA is reachable at http://<tailscale-ip>:5173 from any
#      device on the tailnet.
#   3. Runs all three via `concurrently` with color-coded output. Ctrl-C
#      kills the whole pack atomically.
#
# Override knobs (env):
#   TS_IP=…                  force a specific Tailscale IP / hostname
#   SKIP_TAILSCALE=1         skip detection, bind localhost only
#   BETTER_AUTH_SECRET=…     override generated dev secret
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ---- 1. Tailscale detection ------------------------------------------------

TS_IP="${TS_IP:-}"
if [ -z "$TS_IP" ] && [ -z "${SKIP_TAILSCALE:-}" ]; then
  if command -v tailscale >/dev/null 2>&1; then
    TS_IP="$(tailscale ip -4 2>/dev/null | head -1 || true)"
  fi
fi

# ---- 2. Vite-side sync URL -------------------------------------------------
# VITE_SYNC_URL is read at build/dev time by src/jazz/provider.tsx.
# When unset, the SPA derives ws://<window.location.host>/sync/ which
# fails under `npm run dev` (no path-prefix proxy for /sync/* in the dev
# server — that's a deploy-only Caddy rule). So we always set it here.

if [ -n "$TS_IP" ]; then
  export VITE_SYNC_URL="ws://${TS_IP}:4200"
else
  export VITE_SYNC_URL="ws://localhost:4200"
fi

# ---- 3. Auth-server env ----------------------------------------------------

if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  # Random per-run secret. Local dev only; persists for the lifetime of
  # this process. The first sign-up writes credentials encrypted with
  # THIS secret — subsequent restarts of dev-all invalidate prior sessions
  # but leave the encrypted user rows readable next time the same secret
  # appears. For long-lived local accounts, set BETTER_AUTH_SECRET in
  # your shell rc so it survives restarts.
  export BETTER_AUTH_SECRET="dev-$(head -c 24 /dev/urandom | base64 | tr -d /+=)"
fi
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:5173/api/auth}"
export AUTH_PORT="${AUTH_PORT:-4300}"
# Auth-server defaults to 10/15-minute rate limit; raise the ceiling for
# local dev so rapid e2e-style testing doesn't hit 429s.
export AUTH_RATE_LIMIT_MAX="${AUTH_RATE_LIMIT_MAX:-1000}"
export AUTH_RATE_LIMIT_WINDOW="${AUTH_RATE_LIMIT_WINDOW:-60}"

# ---- 4. Sync-server env ----------------------------------------------------

export SYNC_HOST="${SYNC_HOST:-0.0.0.0}"
export SYNC_PORT="${SYNC_PORT:-4200}"

# ---- 5. Friendly banner ----------------------------------------------------

cat <<EOF

╭───────────────────────────────────────────────────────────────╮
│ jazz-messanger dev                                            │
EOF
if [ -n "$TS_IP" ]; then
  cat <<EOF
│  • Tailscale exposed at:  http://${TS_IP}:5173            │
│  • Sync server:           ws://${TS_IP}:4200/             │
│                                                               │
│  Reachable from any device on your tailnet.                   │
EOF
else
  cat <<EOF
│  • Tailscale not detected (or SKIP_TAILSCALE=1)               │
│  • Local-only at:         http://localhost:5173               │
EOF
fi
cat <<EOF
╰───────────────────────────────────────────────────────────────╯

EOF

# ---- 6. Launch all three services ------------------------------------------

# -k = kill all on first failure (so Ctrl-C tears down everything)
# -n = process names for log prefix
# -c = colors per process
# Quoted commands ensure env vars propagate via the spawned shell.
exec npx --no-install concurrently \
  -k \
  -n "sync,auth,vite" \
  -c "cyan,magenta,green" \
  --kill-others-on-fail \
  "npm run sync" \
  "PORT=${AUTH_PORT} npm run auth" \
  "npx vite --host 0.0.0.0"
