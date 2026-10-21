#!/usr/bin/env bash
# Builds the routing map and search data without touching the live service:
# downloads the region's OpenStreetMap extract to data/osm/region.osm.pbf,
# adds realistic travel speeds (places/practical_speeds.py), builds Valhalla's
# tiles into data/valhalla-next, and the places and named-roads lists into
# data/places-next. map-switch.sh puts them live. GitHub builds the weekly
# London map this way (data.yml); a server builds its own only when it can't
# download one (fetch-data.sh).
#
# The region comes from PBF_URL in .env (Greater London by default), so
# covering more of the UK, or Ireland, is a change of setting. Learned
# speeds, if any, are read from data/learned/practical_speeds.csv.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

IMAGE=ghcr.io/valhalla/valhalla-scripted:3.9.1
DEFAULT_PBF_URL=https://download.geofabrik.de/europe/united-kingdom/england/greater-london-latest.osm.pbf
PBF_URL=$(setting PBF_URL)
PBF_URL=${PBF_URL:-$DEFAULT_PBF_URL}

say "downloading $PBF_URL"
mkdir -p data/osm
curl -fsSL --retry 3 -o data/osm/region.osm.pbf.part "$PBF_URL"
mv data/osm/region.osm.pbf.part data/osm/region.osm.pbf

say "adding travel speeds"
rm -rf data/valhalla-next data/places-next
mkdir -p data/valhalla-next data/places-next
LEARNED=()
[ -s data/learned/practical_speeds.csv ] && LEARNED=(/data/learned/practical_speeds.csv)
docker compose run --rm --entrypoint python places practical_speeds.py \
  /data/osm/region.osm.pbf /data/valhalla-next/region.osm.pbf "${LEARNED[@]}" </dev/null

say "building tiles"
docker run --rm \
  -v "$PWD/data/valhalla-next:/custom_files" \
  -e serve_tiles=False \
  -e force_rebuild=True \
  -e build_admins=True \
  -e build_time_zones=True \
  "$IMAGE" </dev/null

if [ ! -s data/valhalla-next/valhalla_tiles.tar ]; then
  say "build produced no tiles"
  rm -rf data/valhalla-next data/places-next
  exit 1
fi
# The extract with speeds was only needed to build the tiles.
rm -f data/valhalla-next/region.osm.pbf

# Never fatal: without it, routes still work and just skip live closures.
bash scripts/valhalla-limits.sh data/valhalla-next >/dev/null </dev/null ||
  say "couldn't raise Valhalla's avoid-area limits; live closures may be skipped"

# Places come from the same extract, so they stay in step with the roads.
say "extracting places and named roads"
docker compose run --rm places /data/osm/region.osm.pbf /data/places-next/places.txt.gz </dev/null
docker compose run --rm --entrypoint python places extract_roads.py \
  /data/osm/region.osm.pbf /data/places-next/roads.txt.gz </dev/null
say "map built"
