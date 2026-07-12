#!/usr/bin/env bash
# scripts/check-platform-purity.sh — @tauri-apps/* may only be imported
# under src/platform/. Everything else goes through the adapter layer.
# Matches any quoted @tauri-apps specifier — import/from/dynamic/wrapped forms alike.
set -euo pipefail

hits=$(grep -rnE "[\"'\`]@tauri-apps" src \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "^src/platform/" || true)

if [ -n "$hits" ]; then
  echo "❌ platform purity violation — import @tauri-apps only in src/platform/:"
  echo "$hits"
  exit 1
fi
echo "✓ platform purity: @tauri-apps imports confined to src/platform/"
