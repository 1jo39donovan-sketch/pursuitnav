#!/usr/bin/env bash
# London smoke test for a live Blue Route server: one-way streets (Stroud
# Green Road and its neighbours), a bus gate, and arrival at 54 Caledonian
# Road. Exits non-zero if any check fails. The deploy workflow runs it last.
#
# Usage: server/scripts/smoke-london.sh https://blueroute-you.duckdns.org [smoke_london.py options]
#
# Needs python3 and the internet. It downloads the OpenStreetMap extract the
# server is built from (PBF_URL, Greater London by default) to check routes
# against its one-way tags; set SMOKE_PBF to use a copy you already have.
set -euo pipefail

API=${1:?Usage: smoke-london.sh https://your-server [options]}
shift
HERE=$(cd "$(dirname "$0")" && pwd)
CACHE=${SMOKE_CACHE:-${TMPDIR:-/tmp}/blueroute-smoke}
mkdir -p "$CACHE"

if [ ! -x "$CACHE/venv/bin/python" ]; then
  python3 -m venv "$CACHE/venv"
fi
"$CACHE/venv/bin/python" -c "import osmium" 2>/dev/null ||
  "$CACHE/venv/bin/pip" install --quiet "osmium==4.*"

PBF=${SMOKE_PBF:-}
if [ -z "$PBF" ]; then
  PBF="$CACHE/region.osm.pbf"
  URL=${PBF_URL:-https://download.geofabrik.de/europe/united-kingdom/england/greater-london-latest.osm.pbf}
  # A day-old copy is close enough to what the server was built from.
  if [ ! -s "$PBF" ] || [ -n "$(find "$PBF" -mmin +1440)" ]; then
    echo "Downloading $URL"
    curl -fsSL --retry 3 -o "$PBF.part" "$URL"
    mv "$PBF.part" "$PBF"
  fi
fi

exec "$CACHE/venv/bin/python" "$HERE/smoke_london.py" --api "$API" --pbf "$PBF" "$@"
