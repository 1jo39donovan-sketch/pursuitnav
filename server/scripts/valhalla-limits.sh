#!/usr/bin/env bash
# Raises Valhalla's limits on avoid areas in a tiles folder's valhalla.json.
# Live TfL closures are sent as avoid areas, and the defaults (10 km of
# outline, 100 corners) are far too small for London. Prints "changed" if it
# changed anything. Usage: scripts/valhalla-limits.sh data/valhalla
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f "$1/valhalla.json" ] || exit 0
docker compose run --rm -T --entrypoint python places -c '
import json, sys
p = sys.argv[1] + "/valhalla.json"
c = json.load(open(p))
limits = c["service_limits"]
want = {"max_exclude_polygons_length": 500000, "max_exclude_polygons_vertices": 5000}
if all(limits.get(k) == v for k, v in want.items()):
    sys.exit(0)
limits.update(want)
json.dump(c, open(p, "w"), indent=2)
print("changed")
' "/data/${1#data/}"
