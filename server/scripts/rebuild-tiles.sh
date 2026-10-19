#!/usr/bin/env bash
# Weekly map refresh, run from cron. Kept under this name so existing
# servers' cron entries carry on working; the work is in build-map.sh.
exec "$(dirname "$0")/build-map.sh" "$@"
