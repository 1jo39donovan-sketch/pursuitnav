#!/usr/bin/env bash
# Builds the routing map and search data without touching the live service:
# downloads the region's OpenStreetMap extracts to data/osm/region.osm.pbf,
# adds realistic travel speeds (places/practical_speeds.py), builds Valhalla's
# tiles into data/valhalla-next, and the places and named-roads lists into
# data/places-next. map-switch.sh puts them live. GitHub builds the weekly
# London map this way (data.yml); a server builds its own only when it can't
# download one (fetch-data.sh).
#
# The region comes from PBF_URL in .env (Greater London by default), plus
# EXTRA_PBF_URLS (space-separated; Kent by default, for the Kent pilot; "none"
# for none), merged into one extract. House-number search is imported from
# PBF_URL's extract alone (data/osm/geocoder.osm.pbf), which keeps it within
# a 4 GB server. Learned speeds, if any, are read from
# data/learned/practical_speeds.csv.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

IMAGE=ghcr.io/valhalla/valhalla-scripted:3.9.1
DEFAULT_PBF_URL=https://download.geofabrik.de/europe/united-kingdom/england/greater-london-latest.osm.pbf
DEFAULT_EXTRA_PBF_URLS=https://download.geofabrik.de/europe/united-kingdom/england/kent-latest.osm.pbf
PBF_URL=$(setting PBF_URL)
PBF_URL=${PBF_URL:-$DEFAULT_PBF_URL}
EXTRA_PBF_URLS=$(setting EXTRA_PBF_URLS)
EXTRA_PBF_URLS=${EXTRA_PBF_URLS:-$DEFAULT_EXTRA_PBF_URLS}
[ "$EXTRA_PBF_URLS" = none ] && EXTRA_PBF_URLS=""

mkdir -p data/osm
rm -f data/osm/extra-*.osm.pbf
say "downloading $PBF_URL"
curl -fsSL --retry 3 -o data/osm/geocoder.osm.pbf.part "$PBF_URL"
mv data/osm/geocoder.osm.pbf.part data/osm/geocoder.osm.pbf
extras=()
n=0
for url in $EXTRA_PBF_URLS; do
  n=$((n + 1))
  say "downloading $url"
  curl -fsSL --retry 3 -o "data/osm/extra-$n.osm.pbf" "$url"
  extras+=("/data/osm/extra-$n.osm.pbf")
done
if [ ${#extras[@]} -gt 0 ]; then
  # Neighbouring extracts share the roads that cross between them; osmium
  # keeps one copy of each, so the routes join up at the border.
  say "merging ${#extras[@]} more extract(s) into the region"
  docker compose run --rm --entrypoint osmium places merge --overwrite \
    /data/osm/geocoder.osm.pbf "${extras[@]}" -o /data/osm/region.osm.pbf.part.pbf </dev/null
  mv data/osm/region.osm.pbf.part.pbf data/osm/region.osm.pbf
  rm -f data/osm/extra-*.osm.pbf
else
  cp data/osm/geocoder.osm.pbf data/osm/region.osm.pbf
fi

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
say "extracting places, named roads and entrances"
docker compose run --rm places /data/osm/region.osm.pbf /data/places-next/places.txt.gz </dev/null
docker compose run --rm --entrypoint python places extract_roads.py \
  /data/osm/region.osm.pbf /data/places-next/roads.txt.gz </dev/null
docker compose run --rm --entrypoint python places extract_entrances.py \
  /data/osm/region.osm.pbf /data/places-next/entrances.txt.gz </dev/null
say "map built"
