#!/usr/bin/env bash
# Extracts every named place in London (shops, cafés, schools, parks, blocks,
# estates…) from the OSM extract the routing tiles were built from, for the
# app's place search. build-map.sh runs it after each map build.
set -euo pipefail

cd "$(dirname "$0")/.."
# The downloaded extract (build-map.sh); older servers kept it with the tiles.
PBF=""
for f in data/osm/region.osm.pbf data/valhalla/*.osm.pbf; do
  [ -f "$f" ] && { PBF=$f; break; }
done
if [ -z "$PBF" ]; then
  echo "No .osm.pbf yet; run scripts/build-map.sh first." >&2
  exit 1
fi

mkdir -p data/places
echo "$(date -Is) extracting places from $PBF"
docker compose run --rm places "/${PBF}" /data/places/places.txt.gz
echo "$(date -Is) extracting named roads from $PBF"
docker compose run --rm --entrypoint python places extract_roads.py "/${PBF}" /data/places/roads.txt.gz
echo "$(date -Is) extracting entrances from $PBF"
docker compose run --rm --entrypoint python places extract_entrances.py "/${PBF}" /data/places/entrances.txt.gz
echo "$(date -Is) done"
