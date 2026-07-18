#!/usr/bin/env bash
# scripts/check-tokens.sh — fail if any .tsx file under src/ uses ad-hoc
# Tailwind color/typography classes instead of design tokens.
#
# Run manually or via a pre-commit hook. Exit 1 on violations.
set -euo pipefail

# Note: bg-black/N opacity-suffixed overlays are intentionally allowed —
# semi-transparent black scrims behind modals/lightboxes are theme-agnostic
# by design. Solid bg-white is still rejected.
PATTERNS='bg-(white|blue-[0-9]+|gray-[0-9]+|slate-[0-9]+|zinc-[0-9]+|neutral-[0-9]+)|text-(gray-[0-9]+|slate-[0-9]+|zinc-[0-9]+|green-[0-9]+|blue-[0-9]+)|border-(gray-[0-9]+|slate-[0-9]+|zinc-[0-9]+|blue-[0-9]+)'

hits=$(grep -rnE "$PATTERNS" src --include="*.tsx" 2>/dev/null || true)

if [ -n "$hits" ]; then
  echo "❌ ad-hoc Tailwind color/typography classes found — use tokens instead:"
  echo "$hits"
  echo
  echo "Token cheatsheet:"
  echo "  bg-white → bg-panel        text-gray-800 → text-text"
  echo "  bg-gray-100 → bg-panel-2   text-gray-500 → text-dim"
  echo "  border-gray-200 → border-hairline"
  exit 1
fi

# Motion tokens: raw duration-[...] literals bypass the motion scale — use
# the named utilities (duration-fast/base/nav/switch) from tailwind.config.
dur_hits=$(grep -rnE 'duration-\[[.0-9]' src --include="*.tsx" 2>/dev/null || true)

if [ -n "$dur_hits" ]; then
  echo "❌ raw duration-[...] literals found — use motion tokens instead:"
  echo "$dur_hits"
  echo
  echo "  duration-[150ms] → duration-fast (120ms) | duration-base (200ms)"
  echo "                     duration-nav (240ms)  | duration-switch (180ms)"
  exit 1
fi

echo "✓ no ad-hoc Tailwind color/typography classes detected"
