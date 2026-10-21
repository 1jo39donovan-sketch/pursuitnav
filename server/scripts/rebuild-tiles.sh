#!/usr/bin/env bash
# Daily data refresh, run from cron at 03:15 (scripts/cron.sh). Kept under
# this name so existing servers' cron entries carry on working.
#
# Takes the newest map and house-number search GitHub built (fetch-data.sh);
# usually there's nothing new and it stops at once. When there's nothing it
# can use (no release, or a region GitHub doesn't build), it builds here
# instead, on Sundays only: the map first, then the house-number search,
# never at the same time. Likewise a map with this server's learned speeds.
set -uo pipefail
cd "$(dirname "$0")/.."
code=0
bash scripts/fetch-data.sh || code=$?
sunday=$([ "$(date +%u)" = 7 ] && echo 1 || echo 0)
case "$code" in
  0)
    if [ -s data/learned/practical_speeds.csv ] && [ "$sunday" = 1 ]; then
      bash scripts/build-map.sh
    fi
    ;;
  2)
    if [ "$sunday" = 1 ] || [ ! -d data/valhalla ]; then
      bash scripts/build-map.sh && bash scripts/build-geocoder.sh
    fi
    ;;
  *) exit 1 ;;
esac
