#!/usr/bin/env bash
# Omarchy theme-set hook. $1 is the theme slug.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
exec kite-sync-theme "$@"
