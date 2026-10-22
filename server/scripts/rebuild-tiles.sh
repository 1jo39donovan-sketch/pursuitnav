#!/usr/bin/env bash
# Weekly map refresh, run from cron. Kept under this name so existing
# servers' cron entries carry on working. The routing map and places first
# (build-map.sh); then the house-number search from the same extract
# (build-geocoder.sh), never at the same time as the tile build.
set -euo pipefail
bash "$(dirname "$0")/build-map.sh" "$@"
bash "$(dirname "$0")/build-geocoder.sh"
