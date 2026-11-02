#!/usr/bin/env bash
# Standalone suites; see tools/TESTING.md for prerequisites and overrides.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
command -v node >/dev/null || { echo 'Missing node on PATH (Node 24 recommended).' >&2; exit 2; }
exec node "$root/tools/run-library-tests.cjs" engine "$root" "$@"
