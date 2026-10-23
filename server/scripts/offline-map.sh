#!/usr/bin/env bash
# Builds the map officers keep on their phones for when there's no signal:
# the region's vector tiles as one PMTiles file (Planetiler, OpenMapTiles
# layers: the same ones OpenFreeMap serves, so the app's styles draw it
# unchanged), plus the styles, fonts and icons, with a manifest. Into
# data/places-next/offline, so it ships and goes live with the places file;
# the API serves it at /v1/offline-map. Run after map-build.sh (it reads the
# extract that downloads), by data.yml each week.
#
# The area is REGION_BOUNDS in .env (west,south,east,north; Greater London
# by default, as in src/config.ts), so another region is a change of setting.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh
SAY_PREFIX="offline map: "

IMAGE=ghcr.io/onthegomap/planetiler:0.10.2
# Tiles to zoom 14 hold every detail; the phone draws closer zooms from them.
MIN_ZOOM=0
MAX_ZOOM=14
STYLE_NIGHT=https://tiles.openfreemap.org/styles/dark
STYLE_DAY=https://tiles.openfreemap.org/styles/liberty
bounds=$(region_bounds)
out=data/places-next/offline

[ -s data/osm/region.osm.pbf ] || { say "no extract: run map-build.sh first"; exit 1; }
rm -rf "$out"
mkdir -p "$out" data/planetiler

say "building tiles for $bounds"
# Water, coastline and country outlines come from Planetiler's own downloads
# (OSM water polygons, Natural Earth), kept in data/planetiler between runs.
# As this user, so the styles step can write beside the tiles.
docker run --rm --user "$(id -u):$(id -g)" -e JAVA_TOOL_OPTIONS=-Xmx8g -v "$PWD/data:/data" "$IMAGE" \
  --osm-path=/data/osm/region.osm.pbf --download --download-dir=/data/planetiler \
  --bounds="$bounds" --minzoom="$MIN_ZOOM" --maxzoom="$MAX_ZOOM" \
  --output=/data/places-next/offline/map.pmtiles --force </dev/null
[ -s "$out/map.pmtiles" ] || { say "build produced no tiles"; exit 1; }

say "adding styles, fonts and icons"
python3 scripts/offline_styles.py "$out" "$bounds" "$MIN_ZOOM" "$MAX_ZOOM" night="$STYLE_NIGHT" day="$STYLE_DAY"
du -sh "$out"
