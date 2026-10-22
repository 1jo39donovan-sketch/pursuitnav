#!/usr/bin/env bash
# Puts a built map live: data/valhalla-next becomes data/valhalla (the old
# tiles kept in data/valhalla-prev) and Valhalla restarts on it; the places
# lists in data/places-next replace data/places. A few seconds of routing
# downtime while Valhalla restarts.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

[ -s data/valhalla-next/valhalla_tiles.tar ] || { say "no built map in data/valhalla-next"; exit 1; }
say "swapping in new tiles"
rm -rf data/valhalla-prev
[ -d data/valhalla ] && mv data/valhalla data/valhalla-prev
mv data/valhalla-next data/valhalla
if [ -n "$(docker compose ps -q valhalla 2>/dev/null)" ]; then
  docker compose restart valhalla </dev/null
else
  docker compose up -d valhalla </dev/null
fi
if [ -d data/places-next ]; then
  mkdir -p data/places
  for f in data/places-next/*; do mv -f "$f" "data/places/$(basename "$f")"; done
  rmdir data/places-next
fi
say "map live (previous tiles kept in data/valhalla-prev)"
