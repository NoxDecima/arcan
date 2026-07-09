#!/usr/bin/env bash
# scripts/dev-all.sh — one-command local dev: sync + auth + Vite,
# auto-exposed on Tailscale (or localhost-only if Tailscale isn't running).
#
# Usage: npm run dev:all       — tailnet-only (or localhost if no Tailscale)
#        npm run dev:funnel    — same stack, but the URL is PUBLIC via
#                                Tailscale Funnel for the lifetime of the
#                                process (Ctrl-C reverts to tailnet-only)
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
#   BETTER_AUTH_SECRET=…     override the pinned dev secret
#   AUTH_RATE_LIMIT_MAX/_WINDOW=…  override per-mode rate-limit defaults
set -euo pipefail

FUNNEL="${FUNNEL:-}"
for arg in "$@"; do
  case "$arg" in
    --funnel) FUNNEL=1 ;;
    *) echo "dev-all.sh: unknown argument: $arg (supported: --funnel)" >&2; exit 1 ;;
  esac
done

if [ -n "$FUNNEL" ] && [ -n "${SKIP_TAILSCALE:-}" ]; then
  echo "dev-all.sh: --funnel and SKIP_TAILSCALE=1 are mutually exclusive." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Load project-local secrets / overrides from .env.local if present.
# Format: KEY=value (one per line). Comments starting with # are ignored.
# `set -a` auto-exports each KEY so all three child processes inherit them
# (Vite reads ALLOWED_ORIGINS via vite.config.ts; the api script also
# sources .env.local for the standalone `npm run api` case).
if [ -f "$REPO_ROOT/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env.local"
  set +a
fi

# ---- 1. Tailscale detection ------------------------------------------------

# Prefer Tailscale Serve if it's configured to proxy port 5173 over HTTPS.
# Serve gives a real cert + valid HTTPS, which is required for the Web
# Crypto API (used by src/auth/kdf.ts). Without Serve, accessing the
# dev app via a Tailscale IP over plain HTTP breaks sign-up because
# crypto.subtle is undefined in non-secure contexts.
TS_SERVE_URL=""
TS_IP="${TS_IP:-}"
if [ -z "${SKIP_TAILSCALE:-}" ] && command -v tailscale >/dev/null 2>&1; then
  # Look for "https://..." line whose proxy target is localhost:5173.
  TS_SERVE_URL="$(tailscale serve status 2>/dev/null \
    | awk '/^https:\/\// {url=$1} /proxy http:\/\/localhost:5173/ {print url; exit}')"
  if [ -z "$TS_IP" ]; then
    TS_IP="$(tailscale ip -4 2>/dev/null | head -1 || true)"
  fi
fi

# ---- 1b. Funnel: flip the Serve listener public ------------------------------
# `tailscale funnel --bg 5173` re-declares the same :443 listener that Serve
# uses, marked public — the URL is IDENTICAL to the Serve URL, only the
# audience changes. Everything downstream (ALLOWED_ORIGINS, origin-derived
# sync URL) therefore reuses the Serve branch unmodified.
FUNNEL_ACTIVE=""
if [ -n "$FUNNEL" ]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "✗ dev:funnel requires the tailscale CLI on PATH." >&2
    exit 1
  fi

  # Snapshot the pre-demo state, then revert on ANY exit: re-declaring the
  # listener with plain `serve` flips it back to tailnet-only; if nothing
  # was configured before, clear it entirely. Trap installed BEFORE the
  # funnel command so no exit path can leave the URL public.
  HAD_SERVE_5173="$TS_SERVE_URL"
  revert_funnel() {
    echo ""
    echo "Reverting public Funnel → tailnet-only…"
    if [ -n "$HAD_SERVE_5173" ]; then
      tailscale serve --bg 5173 >/dev/null 2>&1 || true
    else
      tailscale serve reset >/dev/null 2>&1 || true
    fi
  }
  trap revert_funnel EXIT

  # First-ever use needs the `funnel` node attribute — tailscale prints the
  # admin-console approval link on failure, so don't swallow its output.
  if ! tailscale funnel --bg 5173; then
    echo "✗ Could not enable Tailscale Funnel (see message above)." >&2
    echo "  First use requires approving the 'funnel' node attribute via the printed link." >&2
    exit 1
  fi
  FUNNEL_ACTIVE=1

  TS_SERVE_URL="$(tailscale serve status 2>/dev/null \
    | awk '/^https:\/\// {url=$1} /proxy http:\/\/localhost:5173/ {print url; exit}')"
  if [ -z "$TS_SERVE_URL" ]; then
    echo "✗ Funnel reported success but no URL for :5173 in 'tailscale serve status'." >&2
    exit 1
  fi
fi

# ---- 2. Vite-side sync URL -------------------------------------------------
# VITE_SYNC_URL is read at build/dev time by src/jazz/provider.tsx.
# When unset, the SPA derives ws(s)://<window.location.host>/sync/, which
# routes through Vite's dev proxy (`/sync` → ws://localhost:4200, see
# vite.config.ts). That's what we want when accessed via either localhost
# OR a Tailscale Serve HTTPS URL — both same-origin to Vite.
#
# We ONLY set VITE_SYNC_URL when falling back to plain-HTTP-via-Tailscale-IP
# (no Serve), because in that case the SPA loads from http://<ip>:5173 and
# needs an explicit ws:// URL for the same-host sync server. Note: this
# plain-HTTP path doesn't support sign-up/sign-in (Web Crypto requires
# HTTPS or localhost) — it's only useful for read-only browsing.

if [ -n "$TS_SERVE_URL" ]; then
  unset VITE_SYNC_URL
  # Unified env var: Vite (server.allowedHosts via vite.config.ts) and
  # Better Auth (BETTER_AUTH_TRUSTED_ORIGINS via api.sh) both
  # pick this up. Full HTTPS origin works for both — Vite's parser
  # strips the scheme to get the host, BA accepts the origin natively.
  export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-${TS_SERVE_URL}}"
elif [ -n "$TS_IP" ]; then
  export VITE_SYNC_URL="ws://${TS_IP}:4200"
else
  export VITE_SYNC_URL="ws://localhost:4200"
fi

# ---- 3. Auth-server env ----------------------------------------------------

if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  # Generate ONCE and pin to .env.local (gitignored; sourced above and by
  # api.sh) so every later run — dev:all or dev:funnel — reuses it.
  # Sessions and encrypted credential rows are bound to this secret;
  # regenerating per run (the old behavior) logged everyone out and
  # orphaned their accounts on each restart. Env still wins if set.
  BETTER_AUTH_SECRET="dev-$(head -c 24 /dev/urandom | base64 | tr -d /+=)"
  {
    echo ""
    echo "# Pinned dev auth secret — auto-generated by scripts/dev-all.sh."
    echo "# Deleting this logs out every dev user and orphans their accounts."
    echo "BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}"
  } >> "$REPO_ROOT/.env.local"
  export BETTER_AUTH_SECRET
  echo "• Pinned a new BETTER_AUTH_SECRET into .env.local (first run only)."
fi
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:5173/api/auth}"
export AUTH_PORT="${AUTH_PORT:-4300}"
if [ -n "$FUNNEL_ACTIVE" ]; then
  # Public URL ⇒ near-prod auth rate limits (deploy uses 5/900s). 10/900s
  # gives a room of demo sign-ups headroom while staying brute-force-hostile.
  export AUTH_RATE_LIMIT_MAX="${AUTH_RATE_LIMIT_MAX:-10}"
  export AUTH_RATE_LIMIT_WINDOW="${AUTH_RATE_LIMIT_WINDOW:-900}"
else
  # Tailnet-only: raise the ceiling so rapid e2e-style testing doesn't 429.
  export AUTH_RATE_LIMIT_MAX="${AUTH_RATE_LIMIT_MAX:-1000}"
  export AUTH_RATE_LIMIT_WINDOW="${AUTH_RATE_LIMIT_WINDOW:-60}"
fi

# ---- 4. Sync-server env ----------------------------------------------------

export SYNC_HOST="${SYNC_HOST:-0.0.0.0}"
export SYNC_PORT="${SYNC_PORT:-4200}"

# ---- 5. Friendly banner ----------------------------------------------------

echo ""
echo "╭─── arcan dev ───────────────────────────────────────────────"
echo "│"
if [ -n "$FUNNEL_ACTIVE" ]; then
  echo "│  ⚠ PUBLIC — Tailscale Funnel is ON. Anyone with this URL can"
  echo "│    reach the app (no Tailscale needed on their side):"
  echo "│      ${TS_SERVE_URL}"
  echo "│"
  echo "│  Auth rate limit: ${AUTH_RATE_LIMIT_MAX} req / ${AUTH_RATE_LIMIT_WINDOW}s (env-overridable)."
  echo "│  Ctrl-C stops the stack AND reverts the URL to tailnet-only."
elif [ -n "$TS_SERVE_URL" ]; then
  echo "│  ★ Tailscale Serve (HTTPS, valid cert, Web Crypto works):"
  echo "│      ${TS_SERVE_URL}"
  echo "│"
  echo "│  Local fallback:  http://localhost:5173"
  echo "│"
  echo "│  Reachable from any device on your tailnet. Sign-up + sign-in"
  echo "│  work over the HTTPS URL (secure context required for the"
  echo "│  Web Crypto API used by src/auth/kdf.ts)."
elif [ -n "$TS_IP" ]; then
  echo "│  • Tailscale Serve NOT configured — falling back to HTTP/IP."
  echo "│      http://${TS_IP}:5173"
  echo "│"
  echo "│  ⚠ Sign-up + sign-in will fail over this plain-HTTP path"
  echo "│    because crypto.subtle is undefined in non-secure contexts."
  echo "│    Set up Tailscale Serve to fix: see scripts/dev-all.sh."
  echo "│"
  echo "│  Local (secure context):  http://localhost:5173"
else
  echo "│  • Tailscale not detected (or SKIP_TAILSCALE=1)"
  echo "│  • Local-only at:  http://localhost:5173"
fi
echo "│"
echo "╰─────────────────────────────────────────────────────────────"
echo ""

# ---- 6. Launch all three services ------------------------------------------

# -k = kill all on first failure (so Ctrl-C tears down everything)
# -n = process names for log prefix
# -c = colors per process
# Quoted commands ensure env vars propagate via the spawned shell.
CONCURRENTLY=(npx --no-install concurrently
  -k
  -n "sync,auth,vite"
  -c "cyan,magenta,green"
  --kill-others-on-fail
  "npm run sync"
  "PORT=${AUTH_PORT} npm run api"
  "npx vite --host 0.0.0.0")

if [ -n "$FUNNEL_ACTIVE" ]; then
  # No exec: the shell must outlive concurrently so the EXIT trap can flip
  # the listener back to tailnet-only after Ctrl-C.
  "${CONCURRENTLY[@]}"
else
  exec "${CONCURRENTLY[@]}"
fi
