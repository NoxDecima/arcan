#!/usr/bin/env bash
set -euo pipefail
mkdir -p .jazz-data

# Host the sync server binds to.
#   - Default 127.0.0.1 (localhost only — safe for solo dev).
#   - Set SYNC_HOST=0.0.0.0 to expose the sync server on the LAN so other
#     devices on the same network can connect via this machine's IP.
#   - The frontend's sync URL is controlled separately via VITE_SYNC_URL
#     (see src/jazz/provider.tsx and .env.example).
SYNC_HOST="${SYNC_HOST:-127.0.0.1}"
SYNC_PORT="${SYNC_PORT:-4200}"

exec npx jazz-run sync \
  --host "$SYNC_HOST" \
  --port "$SYNC_PORT" \
  --db .jazz-data/sync.sqlite
