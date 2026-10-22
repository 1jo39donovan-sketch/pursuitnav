#!/usr/bin/env bash
# Packs a built map (data/valhalla-next, data/places-next) and house-number
# database (the folder given) into release files for servers to download
# (fetch-data.sh): each one tar + zstd, split into parts under GitHub's 2 GB
# limit, with a manifest of their sizes and SHA-256 sums. Run by data.yml,
# as root (the database's files belong to its container's postgres user).
#
#   bash scripts/data-package.sh ./data/nominatim/a data/release [build-report.json]
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh
SAY_PREFIX="package: "

geocoder=${1:?Usage: data-package.sh <nominatim folder> <out folder> [report]}
out=${2:?Usage: data-package.sh <nominatim folder> <out folder> [report]}
report=${3:-}
rm -rf "$out"
mkdir -p "$out"

pack() { # name, folder, [tar options]
  local name=$1 dir=$2
  shift 2
  say "packing $dir as $name"
  tar "$@" -C "$dir" -cf - . | zstd -T0 -10 -q -o "$out/$name"
}
pack valhalla.tar.zst data/valhalla-next
pack places.tar.zst data/places-next
pack nominatim.tar.zst "$geocoder" --numeric-owner

python3 - "$out" "$report" <<'PY'
import hashlib, json, os, subprocess, sys, time
out, report = sys.argv[1], sys.argv[2]
files = []
for name in ("valhalla.tar.zst", "places.tar.zst", "nominatim.tar.zst"):
    path = os.path.join(out, name)
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    size = os.path.getsize(path)
    # GitHub release files must be under 2 GB.
    subprocess.run(["split", "-b", "1900m", "-d", "-a", "2", path, path + ".part"], check=True)
    os.remove(path)
    parts = sorted(p for p in os.listdir(out) if p.startswith(name + ".part"))
    files.append({"name": name, "bytes": size, "sha256": h.hexdigest(), "parts": parts})
manifest = {
    "format": 1,
    "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "region": "greater-london",
    "nominatimImage": "mediagis/nominatim:5.3",
    "valhallaImage": "ghcr.io/valhalla/valhalla-scripted:3.9.1",
    "files": files,
}
if report and os.path.exists(report):
    manifest["geocoderBuild"] = json.load(open(report))
json.dump(manifest, open(os.path.join(out, "manifest.json"), "w"), indent=2)
print(json.dumps(manifest, indent=2))
PY
