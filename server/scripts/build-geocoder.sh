#!/usr/bin/env bash
# Builds the house-number search: imports the OpenStreetMap extract that
# build-map.sh downloaded into a fresh Nominatim database, checks it finds a
# known street, then switches the live nominatim service over to it. The
# previous database keeps serving until the new one answers, and is deleted
# only then.
#
# Never run it while the routing tiles build: both need most of the memory.
# rebuild-tiles.sh (weekly, from cron) runs it after build-map.sh; install.sh
# and update.sh start it in the background on a server that hasn't one yet:
#   bash scripts/build-geocoder.sh --background
#
# It logs how long the import took, the memory it used, the database's size
# and the memory used while serving, for sizing the server (README.md).
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

IMAGE=mediagis/nominatim:5.3
NAME=blue-route-geocoder-build
say() { echo "$(date -Is) geocoder: $*"; }
setting() { (grep -E "^$1=" .env 2>/dev/null || true) | tail -n 1 | cut -d= -f2-; }
set_setting() {
  sed -i "/^$1=/d" .env
  echo "$1=$2" >>.env
}
mib() { # "1.2GiB" / "512MiB" / "800kB" -> whole MiB
  awk -v v="$1" 'BEGIN {
    n = v + 0; u = v; sub(/^[0-9.]+/, "", u)
    if (u ~ /^GiB|^GB/) n *= 1024; else if (u ~ /^kB|^KiB/) n /= 1024; else if (u ~ /^B$/) n /= 1048576
    printf "%d", n }'
}

# One build at a time, and never during a tile build (build-map.sh builds into valhalla-next).
mkdir -p data/nominatim
exec 9>data/nominatim/.lock
flock -n 9 || { say "another geocoder build is running"; exit 0; }
for i in $(seq 1 240); do
  [ -d data/valhalla-next ] || break
  [ "$i" = 1 ] && say "waiting for the routing tiles to finish building"
  sleep 30
done
[ -s data/osm/region.osm.pbf ] || { say "no map extract yet: run build-map.sh first"; exit 1; }
# A street the new database must find before it's used. Set GEOCODER_CHECK
# in .env for a region other than London.
CHECK=$(setting GEOCODER_CHECK)
CHECK=${CHECK:-Caledonian Road, London}

current=$(setting NOMINATIM_DATA)
next=./data/nominatim/a
[ "$current" = ./data/nominatim/a ] && next=./data/nominatim/b

free_mb=$(df -Pm . | awk 'NR == 2 {print $4}')
say "starting: $free_mb MB disk free; importing into $next (live: ${current:-none})"
if [ "$free_mb" -lt 6000 ]; then
  say "less than 6 GB free: not building (the current database, if any, carries on)"
  exit 1
fi

docker rm -f "$NAME" >/dev/null 2>&1 || true
rm -rf "$next"
mkdir -p "$next"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
start=$(date +%s)
docker pull -q "$IMAGE" >/dev/null
docker run -d --name "$NAME" --shm-size=1g --env-file nominatim.env \
  -v "$PWD/data/osm:/osm:ro" -v "$PWD/${next#./}:/var/lib/postgresql/16/main" \
  "$IMAGE" >/dev/null

# Import, sampling memory every 30 s, until it answers (or gives up after 4 h).
peak_build=0
peak_host=0
peak_swap=0
until docker exec "$NAME" curl -fsS -m 5 http://localhost:8080/status >/dev/null 2>&1; do
  if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" != true ]; then
    say "import failed. The import's last lines:"
    docker logs --tail 40 "$NAME" 2>&1 | sed 's/^/    /'
    rm -rf "$next"
    exit 1
  fi
  if [ $(($(date +%s) - start)) -gt 14400 ]; then
    say "import still not finished after 4 hours: giving up"
    rm -rf "$next"
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
say "imported in $minutes min; peak memory: import container $peak_build MiB, whole server $peak_host MiB used + $peak_swap MiB swap"

found=$(docker exec "$NAME" curl -fsS -G -m 30 --data-urlencode "q=$CHECK" -d format=jsonv2 -d limit=1 \
  http://localhost:8080/search 2>/dev/null || true)
if [ -z "$found" ] || [ "$found" = "[]" ]; then
  say "the new database doesn't find '$CHECK': keeping the current one"
  rm -rf "$next"
  exit 1
fi
say "the new database finds '$CHECK'"
docker stop -t 120 "$NAME" >/dev/null
docker rm "$NAME" >/dev/null
say "database size: $(du -sm "$next" | cut -f1) MB"

# Switch over. The API is told where Nominatim is once it has one.
set_setting NOMINATIM_DATA "$next"
set_setting COMPOSE_PROFILES geocoder
set_setting NOMINATIM_URL http://nominatim:8080
docker compose up -d --no-deps nominatim api </dev/null
ok=0
for _ in $(seq 1 60); do
  if docker compose exec -T api wget -qO- -T 5 http://nominatim:8080/status </dev/null >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 5
done
if [ "$ok" != 1 ]; then
  say "the new database doesn't answer as the live service: going back to ${current:-none}"
  if [ -n "$current" ]; then
    set_setting NOMINATIM_DATA "$current"
    docker compose up -d nominatim </dev/null
  else
    docker compose stop nominatim </dev/null || true
    sed -i '/^NOMINATIM_URL=/d; /^COMPOSE_PROFILES=/d' .env
    docker compose up -d --no-deps api </dev/null
  fi
  exit 1
fi
[ -n "$current" ] && [ "$current" != "$next" ] && rm -rf "$current"
say "live on $next"

# What serving costs, with Valhalla and the API up, after a few searches.
for q in "53 Caledonian Road" "Holloway Road" "N7 8LA"; do
  docker compose exec -T api wget -qO- -T 10 "http://nominatim:8080/search?format=jsonv2&q=${q// /+}" \
    </dev/null >/dev/null 2>&1 || true
done
sleep 30
say "serving memory: $(docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | sed 's/ \/ .*//' | tr '\n' ';')" \
  "whole server $(free -m | awk '/^Mem:/ {print $3}') MiB used + $(free -m | awk '/^Swap:/ {print $3}') MiB swap;" \
  "disk free $(df -Pm . | awk 'NR == 2 {print $4}') MB"
