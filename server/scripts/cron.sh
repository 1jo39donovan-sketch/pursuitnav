#!/usr/bin/env bash
# Writes the server's schedule (/etc/cron.d/blue-route). install.sh runs it,
# and update.sh runs it after each update, so a schedule changed in the code
# reaches servers that already exist.
#   - every 5 minutes: take any new tested code from main (update.sh)
#   - daily 03:15: take the newest map, places and house-number search
#     GitHub built (rebuild-tiles.sh, via fetch-data.sh)
set -euo pipefail
DIR=$(cd "$(dirname "$0")/../.." && pwd)
# main, unless this is a test server set up from another branch (install.sh's BRANCH).
BRANCH=$( (grep -E '^BRANCH=' "$DIR/server/.env" 2>/dev/null || true) | cut -d= -f2-)
want="# BlueRoute server schedule, written by server/scripts/cron.sh. Edit that, not this.
*/5 * * * * root BRANCH=${BRANCH:-main} bash $DIR/server/scripts/update.sh >> /var/log/blue-route-update.log 2>&1
15 3 * * * root bash $DIR/server/scripts/rebuild-tiles.sh >> /var/log/blue-route-tiles.log 2>&1"
if [ "$(cat /etc/cron.d/blue-route 2>/dev/null)" != "$want" ]; then
  printf '%s\n' "$want" >/etc/cron.d/blue-route
  chmod 644 /etc/cron.d/blue-route
  echo "$(date -Is) schedule updated"
fi
