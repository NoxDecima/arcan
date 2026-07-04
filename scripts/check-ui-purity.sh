#!/usr/bin/env bash
# scripts/check-ui-purity.sh — src/ui must stay presentational.
# Rejects imports of Jazz, the router, or the legacy component tree.
set -euo pipefail

PATTERNS="from ['\"]@/jazz|from ['\"]jazz-tools|from ['\"]react-router|from ['\"]@/components"

hits=$(grep -rnE "$PATTERNS" src/ui --include="*.ts" --include="*.tsx" 2>/dev/null || true)

if [ -n "$hits" ]; then
  echo "❌ src/ui purity violation — presenters/kit take data via props only:"
  echo "$hits"
  exit 1
fi
echo "✓ src/ui is pure (no jazz / router / legacy component imports)"
