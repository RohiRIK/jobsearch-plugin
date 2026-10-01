#!/usr/bin/env bash
# Deprecated: installs on Hermes (global) and OpenClaw. Prefer
#   job-search/scripts/jobsearch hosts-install --host <hermes|openclaw|opencode|pi|claude> --dry-run
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$DIR/install/hermes.sh" "$@"
bash "$DIR/install/openclaw.sh" "$@"
