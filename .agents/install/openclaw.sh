#!/usr/bin/env bash
# Deprecated wrapper (kept for one release): OpenClaw installs now go through the
# tested `jobsearch hosts-install`, which links the skills, registers MCP when the
# openclaw CLI exists, and refuses to replace anything it did not create (exit 5).
# Usage: openclaw.sh [--dry-run]
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mode=--yes
[ "${1:-}" = "--dry-run" ] && mode=--dry-run
exec "$REPO/job-search/scripts/jobsearch" hosts-install --host openclaw "$mode" --pretty
