#!/usr/bin/env bash
# scripts/check-platform-purity.sh — @tauri-apps/* may only be imported
# under src/platform/. Everything else goes through the adapter layer.
set -euo pipefail

hits=$(grep -rnE "from ['\"]@tauri-apps|import\(['\"]@tauri-apps|import ['\"]@tauri-apps" src \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "^src/platform/" || true)

if [ -n "$hits" ]; then
  echo "❌ platform purity violation — import @tauri-apps only in src/platform/:"
  echo "$hits"
  exit 1
fi
echo "✓ platform purity: @tauri-apps imports confined to src/platform/"
