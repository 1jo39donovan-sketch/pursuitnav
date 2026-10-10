#!/usr/bin/env bash
# Rebuilds the London routing tiles from the latest OpenStreetMap extract,
# then swaps them in. The live service keeps running on the old tiles during
# the build, so the only interruption is the few seconds of the restart.
#
# Run weekly from cron, e.g.:
#   15 3 * * 0  /opt/blue-route/server/scripts/rebuild-tiles.sh >> /var/log/blue-route-tiles.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
IMAGE=ghcr.io/valhalla/valhalla-scripted:3.9.1
PBF_URL=https://download.geofabrik.de/europe/united-kingdom/england/greater-london-latest.osm.pbf

echo "$(date -Is) building new tiles"
rm -rf data/valhalla-next
mkdir -p data/valhalla-next
docker run --rm \
  -v "$PWD/data/valhalla-next:/custom_files" \
  -e tile_urls="$PBF_URL" \
  -e serve_tiles=False \
  -e force_rebuild=True \
  -e build_admins=True \
  -e build_time_zones=True \
  "$IMAGE"

if [ ! -s data/valhalla-next/valhalla_tiles.tar ]; then
  echo "$(date -Is) build produced no tiles; keeping the current ones" >&2
  exit 1
fi

echo "$(date -Is) swapping in new tiles"
rm -rf data/valhalla-prev
mv data/valhalla data/valhalla-prev
mv data/valhalla-next data/valhalla
docker compose restart valhalla
echo "$(date -Is) done (previous tiles kept in data/valhalla-prev)"

# Places come from the same OSM extract, so they stay in step with the roads.
"$(dirname "$0")/build-places.sh"
