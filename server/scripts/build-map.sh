#!/usr/bin/env bash
# Builds the routing map: downloads the region's OpenStreetMap extract, adds
# realistic travel speeds (places/practical_speeds.py), builds Valhalla's
# tiles from that, swaps them in, and refreshes the places list. The live
# service keeps running on the old tiles during the build.
#
# The region comes from PBF_URL in .env (Greater London by default), so
# covering more of the UK, or Ireland, is a change of setting. Learned
# speeds, if any, are read from data/learned/practical_speeds.csv.
#
# install.sh runs this once; cron runs it weekly (via rebuild-tiles.sh).
set -euo pipefail

cd "$(dirname "$0")/.."
IMAGE=ghcr.io/valhalla/valhalla-scripted:3.9.1
DEFAULT_PBF_URL=https://download.geofabrik.de/europe/united-kingdom/england/greater-london-latest.osm.pbf
PBF_URL=$( (grep -E '^PBF_URL=' .env 2>/dev/null || true) | cut -d= -f2-)
PBF_URL=${PBF_URL:-$DEFAULT_PBF_URL}

echo "$(date -Is) downloading $PBF_URL"
mkdir -p data/osm
curl -fsSL --retry 3 -o data/osm/region.osm.pbf.part "$PBF_URL"
mv data/osm/region.osm.pbf.part data/osm/region.osm.pbf

echo "$(date -Is) adding travel speeds"
rm -rf data/valhalla-next
mkdir -p data/valhalla-next
LEARNED=()
[ -s data/learned/practical_speeds.csv ] && LEARNED=(/data/learned/practical_speeds.csv)
docker compose run --rm --entrypoint python places practical_speeds.py \
  /data/osm/region.osm.pbf /data/valhalla-next/region.osm.pbf "${LEARNED[@]}"

echo "$(date -Is) building tiles"
docker run --rm \
  -v "$PWD/data/valhalla-next:/custom_files" \
  -e serve_tiles=False \
  -e force_rebuild=True \
  -e build_admins=True \
  -e build_time_zones=True \
  "$IMAGE"

if [ ! -s data/valhalla-next/valhalla_tiles.tar ]; then
  echo "$(date -Is) build produced no tiles; keeping the current ones" >&2
  exit 1
fi

# Never fatal: without it, routes still work and just skip live closures.
bash scripts/valhalla-limits.sh data/valhalla-next >/dev/null ||
  echo "$(date -Is) couldn't raise Valhalla's avoid-area limits; live closures may be skipped" >&2

echo "$(date -Is) swapping in new tiles"
rm -rf data/valhalla-prev
[ -d data/valhalla ] && mv data/valhalla data/valhalla-prev
mv data/valhalla-next data/valhalla
if [ -n "$(docker compose ps -q valhalla 2>/dev/null)" ]; then
  docker compose restart valhalla
else
  docker compose up -d valhalla
fi
echo "$(date -Is) tiles done (previous ones kept in data/valhalla-prev)"

# Places come from the same extract, so they stay in step with the roads.
"$(dirname "$0")/build-places.sh"
