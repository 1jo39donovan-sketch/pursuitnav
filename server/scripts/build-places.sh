#!/usr/bin/env bash
# Extracts every named place in London (shops, cafés, schools, parks, blocks,
# estates…) from the OSM extract the routing tiles were built from, for the
# app's place search. Run after the first tile build; rebuild-tiles.sh runs
# it weekly after that.
set -euo pipefail

cd "$(dirname "$0")/.."
PBF=$(ls data/valhalla/*.osm.pbf 2>/dev/null | head -n 1 || true)
if [ -z "$PBF" ]; then
  echo "No .osm.pbf in data/valhalla yet; start the stack and let the tiles build first." >&2
  exit 1
fi

mkdir -p data/places
echo "$(date -Is) extracting places from $PBF"
docker compose run --rm places "/data/valhalla/$(basename "$PBF")" /data/places/places.txt.gz
echo "$(date -Is) done"
