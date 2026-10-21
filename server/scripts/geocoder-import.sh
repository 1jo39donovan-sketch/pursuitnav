#!/usr/bin/env bash
# Imports the OpenStreetMap extract (data/osm/region.osm.pbf) into a fresh
# Nominatim database in the folder given, checks it finds a known street,
# and stops it cleanly. It doesn't touch the live service: geocoder-switch.sh
# puts a database live. GitHub builds the weekly one this way (data.yml);
# a server builds its own only when it can't download one.
#
#   bash scripts/geocoder-import.sh ./data/nominatim/b
#
# Logs how long the import took, the memory it used and the database's size;
# with BUILD_REPORT set, also writes them there as JSON.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh
SAY_PREFIX="geocoder: "

dir=${1:?Usage: geocoder-import.sh <folder under data/>}
NAME=blue-route-geocoder-build
[ -s data/osm/region.osm.pbf ] || { say "no map extract (data/osm/region.osm.pbf)"; exit 1; }
# A street the new database must find. Set GEOCODER_CHECK in .env for a region other than London.
CHECK=$(setting GEOCODER_CHECK)
CHECK=${CHECK:-Caledonian Road, London}

say "importing into $dir ($(free_disk_mb) MB disk free)"
[ "$(free_disk_mb)" -ge 6000 ] || { say "less than 6 GB free: not importing"; exit 1; }
docker rm -f "$NAME" >/dev/null 2>&1 || true
rm -rf "$dir"
mkdir -p "$dir"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
start=$(date +%s)
docker pull -q "$NOMINATIM_IMAGE" >/dev/null
# GEOCODER_THREADS: more import threads on a bigger machine (GitHub's builds use 4).
docker run -d --name "$NAME" --shm-size=1g --env-file nominatim.env ${GEOCODER_THREADS:+-e THREADS=$GEOCODER_THREADS} \
  -v "$PWD/data/osm:/osm:ro" -v "$PWD/${dir#./}:/var/lib/postgresql/16/main" \
  "$NOMINATIM_IMAGE" >/dev/null

# Import, sampling memory every 30 s, until it answers (or gives up after 4 h).
peak_build=0
peak_host=0
peak_swap=0
until docker exec "$NAME" curl -fsS -m 5 http://localhost:8080/status >/dev/null 2>&1; do
  if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" != true ]; then
    say "import failed. Its last lines:"
    docker logs --tail 40 "$NAME" 2>&1 | sed 's/^/    /'
    rm -rf "$dir"
    exit 1
  fi
  if [ $(($(date +%s) - start)) -gt 14400 ]; then
    say "import still not finished after 4 hours: giving up"
    rm -rf "$dir"
    exit 1
  fi
  used=$(mib "$(docker stats --no-stream --format '{{.MemUsage}}' "$NAME" 2>/dev/null | awk '{print $1}')")
  host=$(free -m | awk '/^Mem:/ {print $3}')
  swap=$(free -m | awk '/^Swap:/ {print $3}')
  [ "${used:-0}" -gt "$peak_build" ] && peak_build=$used
  [ "$host" -gt "$peak_host" ] && peak_host=$host
  [ "$swap" -gt "$peak_swap" ] && peak_swap=$swap
  sleep 30
done
minutes=$((($(date +%s) - start + 59) / 60))
say "imported in $minutes min; peak memory: import $peak_build MiB, whole machine $peak_host MiB used + $peak_swap MiB swap"

found=$(docker exec "$NAME" curl -fsS -G -m 30 --data-urlencode "q=$CHECK" -d format=jsonv2 -d limit=1 \
  http://localhost:8080/search 2>/dev/null || true)
if [ -z "$found" ] || [ "$found" = "[]" ]; then
  say "the new database doesn't find '$CHECK'"
  rm -rf "$dir"
  exit 1
fi
docker stop -t 120 "$NAME" >/dev/null
size=$(du -sm "$dir" | cut -f1)
say "the new database finds '$CHECK'; $size MB"
if [ -n "${BUILD_REPORT:-}" ]; then
  printf '{"importMinutes": %s, "importPeakMiB": %s, "machinePeakMiB": %s, "machineSwapPeakMiB": %s, "databaseMB": %s}\n' \
    "$minutes" "$peak_build" "$peak_host" "$peak_swap" "$size" >"$BUILD_REPORT"
fi
