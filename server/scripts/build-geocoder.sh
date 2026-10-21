#!/usr/bin/env bash
# Builds the house-number search on this server, when it can't download the
# one GitHub builds each week (fetch-data.sh): imports the OpenStreetMap
# extract into the database folder not in use (geocoder-import.sh), then puts
# it live (geocoder-switch.sh). The previous database keeps serving until the
# new one answers, and is deleted only then.
#
# Never run it while the routing tiles build: both need most of the memory.
#   bash scripts/build-geocoder.sh --background   (as a background service)
set -euo pipefail

cd "$(dirname "$0")/.."
LOG=/var/log/blue-route-geocoder.log

if [ "${1:-}" = "--background" ]; then
  if systemctl is-active --quiet blue-route-geocoder 2>/dev/null; then
    echo "$(date -Is) geocoder: a build is already running"
    exit 0
  fi
  systemctl reset-failed blue-route-geocoder 2>/dev/null || true
  systemd-run --quiet --unit blue-route-geocoder --collect \
    bash -c "bash '$PWD/scripts/build-geocoder.sh' >>'$LOG' 2>&1"
  echo "$(date -Is) geocoder: build started in the background (log: $LOG)"
  exit 0
fi

. scripts/lib.sh
SAY_PREFIX="geocoder: "

# One build at a time, and never during a tile build (build-map.sh builds into data/valhalla-next).
mkdir -p data/nominatim
exec 9>data/nominatim/.lock
flock -n 9 || { say "another geocoder build is running"; exit 0; }
for i in $(seq 1 240); do
  [ -d data/valhalla-next ] || break
  [ "$i" = 1 ] && say "waiting for the routing tiles to finish building"
  sleep 30
done

next=$(inactive_geocoder_slot)
bash scripts/geocoder-import.sh "$next"
bash scripts/geocoder-switch.sh "$next"
