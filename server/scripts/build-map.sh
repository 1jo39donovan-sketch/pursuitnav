#!/usr/bin/env bash
# Builds the routing map and places on this server and puts them live: when
# it can't download the ones GitHub builds each week (fetch-data.sh), or for
# a region GitHub doesn't build (PBF_URL in .env). The live service keeps
# running on the old map while the new one builds (map-build.sh), then swaps
# it in (map-switch.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/map-build.sh
bash scripts/map-switch.sh
