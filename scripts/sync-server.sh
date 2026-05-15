#!/usr/bin/env bash
set -euo pipefail
mkdir -p .jazz-data
exec npx jazz-run sync --port 4200 --db .jazz-data/sync.sqlite
