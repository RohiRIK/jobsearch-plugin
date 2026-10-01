#!/usr/bin/env bash
# Deprecated wrapper (kept for one release): Hermes installs now go through the
# tested `jobsearch hosts-install`. Usage: hermes.sh [--profile <name>] [--dry-run]
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
args=(hosts-install --host hermes)
mode=--yes
while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile) [ "$#" -ge 2 ] || { echo "--profile requires a name" >&2; exit 2; }; args+=(--scope "profile:$2"); shift 2 ;;
    --dry-run) mode=--dry-run; shift ;;
    -h|--help) echo "Usage: hermes.sh [--profile <name>] [--dry-run]  (prefer: jobsearch hosts-install --host hermes)"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
exec "$REPO/job-search/scripts/jobsearch" "${args[@]}" "$mode" --pretty
