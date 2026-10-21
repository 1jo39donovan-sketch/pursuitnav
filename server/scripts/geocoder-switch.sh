#!/usr/bin/env bash
# Puts a Nominatim database live: points the nominatim service at the folder
# given (data/nominatim/a or b), restarts it and the API, and checks it
# answers. If it doesn't, goes back to the database that was live. Once the
# new one answers, the old one is deleted.
#
#   bash scripts/geocoder-switch.sh ./data/nominatim/b
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh
SAY_PREFIX="geocoder: "

next=${1:?Usage: geocoder-switch.sh ./data/nominatim/a|b}
current=$(setting NOMINATIM_DATA)
# The API is told where Nominatim is once it has one.
set_setting NOMINATIM_DATA "$next"
set_setting COMPOSE_PROFILES geocoder
set_setting NOMINATIM_URL http://nominatim:8080
docker compose up -d --no-deps nominatim api </dev/null
for _ in $(seq 1 60); do
  if docker compose exec -T api wget -qO- -T 5 http://nominatim:8080/status </dev/null >/dev/null 2>&1; then
    [ -n "$current" ] && [ "$current" != "$next" ] && rm -rf "$current"
    say "live on $next"
    # What serving costs, with Valhalla and the API up, after a few searches.
    for q in "53 Caledonian Road" "Holloway Road" "N7 8LA"; do
      docker compose exec -T api wget -qO- -T 10 "http://nominatim:8080/search?format=jsonv2&q=${q// /+}" \
        </dev/null >/dev/null 2>&1 || true
    done
    sleep 20
    say "serving memory: $(docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | sed 's/ \/ .*//' | tr '\n' ';')" \
      "whole server $(free -m | awk '/^Mem:/ {print $3}') MiB used + $(free -m | awk '/^Swap:/ {print $3}') MiB swap;" \
      "disk free $(free_disk_mb) MB"
    exit 0
  fi
  sleep 5
done

say "$next doesn't answer as the live service: going back to ${current:-none}"
if [ -n "$current" ]; then
  set_setting NOMINATIM_DATA "$current"
  docker compose up -d --no-deps nominatim </dev/null
else
  docker compose stop nominatim </dev/null || true
  sed -i '/^NOMINATIM_URL=/d; /^COMPOSE_PROFILES=/d' .env
  docker compose up -d --no-deps api </dev/null
fi
exit 1
