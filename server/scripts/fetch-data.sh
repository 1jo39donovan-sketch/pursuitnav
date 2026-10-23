#!/usr/bin/env bash
# Puts the newest map and house-number search live by downloading what GitHub
# built (the "Map data" workflow, data.yml, publishes a data-YYYYMMDD-HHMM
# release each week) instead of building it here: minutes instead of two
# hours, and no build competing with officers' requests for memory.
#
# Downloads the release's files, checks their SHA-256 sums, unpacks them
# beside the live data, swaps them in (map-switch.sh, geocoder-switch.sh)
# and checks the server (check-server.sh). If the check fails, the previous
# map goes back. On a new server with no data yet (install.sh), the data is
# put in place before anything starts.
#
# Exits 0 when the newest data is live (or already was), 1 if it failed, and
# 2 when there's nothing it can use (no release yet, or a region GitHub
# doesn't build): the caller then builds here (build-map.sh, build-geocoder.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh
SAY_PREFIX="data: "

DEFAULT_PBF_URL=https://download.geofabrik.de/europe/united-kingdom/england/greater-london-latest.osm.pbf
slug=$( (git remote get-url origin 2>/dev/null || true) | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
API=${DATA_RELEASES_API:-https://api.github.com/repos/$slug/releases?per_page=30}
DOWNLOAD=${DATA_DOWNLOAD_BASE:-https://github.com/$slug/releases/download}

pbf=$(setting PBF_URL)
if [ -n "$pbf" ] && [ "$pbf" != "$DEFAULT_PBF_URL" ]; then
  say "this server's region isn't the London map GitHub builds ($pbf): build it here"
  exit 2
fi

mkdir -p data
exec 9>data/.fetch-data.lock
flock -n 9 || { say "already fetching"; exit 0; }

releases=$(curl -fsSL --retry 3 "$API") || { say "can't reach GitHub's release list"; exit 1; }
release=$(python3 -c '
import json, sys
tags = [r["tag_name"] for r in json.load(sys.stdin) if r["tag_name"].startswith("data-") and not r.get("draft")]
print(max(tags) if tags else "")' <<<"$releases")
[ -n "$release" ] || { say "no data release published yet"; exit 2; }
if [ "$release" = "$(cat data/data-release 2>/dev/null)" ]; then
  say "already on $release"
  exit 0
fi

[ "$(free_disk_mb)" -ge 12000 ] || { say "less than 12 GB free: not downloading"; exit 1; }
dl=data/download
rm -rf "$dl"
mkdir -p "$dl"
trap 'rm -rf "$dl"' EXIT
say "downloading $release"
curl -fsSL --retry 5 -o "$dl/manifest.json" "$DOWNLOAD/$release/manifest.json"
# name, sha256 and parts of each file, one line each.
python3 -c '
import json, sys
for f in json.load(open(sys.argv[1]))["files"]:
    print(f["name"], f["sha256"], *f["parts"])' "$dl/manifest.json" >"$dl/files"
while read -r name sum parts; do
  for part in $parts; do
    curl -fsSL --retry 5 -C - -o "$dl/$part" "$DOWNLOAD/$release/$part"
  done
  # shellcheck disable=SC2086
  (cd "$dl" && cat $parts >"$name" && rm -f $parts)
  echo "$sum  $dl/$name" | sha256sum -c --quiet - || { say "$name is damaged (checksum): not using $release"; exit 1; }
done <"$dl/files"

# Learned speeds (opt-in learning) live only on this server, so a map with
# them is built here (build-map.sh); the rest still comes from GitHub.
own_map=0
[ -s data/learned/practical_speeds.csv ] && own_map=1

say "unpacking"
rm -rf data/valhalla-next data/places-next
mkdir -p data/places-next
tar --zstd -xf "$dl/places.tar.zst" -C data/places-next
if [ "$own_map" = 0 ]; then
  mkdir -p data/valhalla-next
  tar --zstd -xf "$dl/valhalla.tar.zst" -C data/valhalla-next
fi
# Which release is live, for GET /health (the API reads data/places).
release_info() {
  python3 -c '
import json, sys
m = json.load(open("data/places/data-release.next.json"))
m["release"] = sys.argv[1]
json.dump(m, open("data/places/data-release.json", "w"))' "$1" && rm -f data/places/data-release.next.json
}

slot=$(inactive_geocoder_slot)
rm -rf "$slot"
mkdir -p "$slot"
tar --zstd --numeric-owner -xpf "$dl/nominatim.tar.zst" -C "$slot"
mkdir -p data/places
cp "$dl/manifest.json" data/places/data-release.next.json
rm -rf "$dl"

# A new server: nothing running yet, so put it all in place; install.sh starts it.
if [ ! -d data/valhalla ] && [ "$own_map" = 0 ]; then
  mv data/valhalla-next data/valhalla
  swap_places
  set_setting NOMINATIM_DATA "$slot"
  set_setting COMPOSE_PROFILES geocoder
  set_setting NOMINATIM_URL http://nominatim:8080
  echo "$release" >data/data-release
  release_info "$release"
  say "in place: $release"
  exit 0
fi

if [ "$own_map" = 0 ]; then
  bash scripts/map-switch.sh
else
  swap_places
fi
bash scripts/geocoder-switch.sh "$slot" || say "the new house-number search didn't answer; the previous one carries on"

if bash scripts/check-server.sh "https://$(setting DOMAIN)" --local --wait 300; then
  echo "$release" >data/data-release
  release_info "$release"
  say "live on $release"
  exit 0
fi
if [ "$own_map" = 0 ] && [ -d data/valhalla-prev ]; then
  say "checks failed on $release's map: going back to the previous one"
  rm -rf data/valhalla-failed
  mv data/valhalla data/valhalla-failed
  mv data/valhalla-prev data/valhalla
  docker compose restart valhalla </dev/null || true
fi
exit 1
