"""Builds Valhalla routing tiles for the synthetic test network.

Needs: pip install pyvalhalla==3.9.1 osmium

Usage: python build_tiles.py <work-dir>
Writes <work-dir>/valhalla.json and <work-dir>/points.json, and prints the
path of the valhalla_service binary to use.
"""

import json
import subprocess
import sys
from pathlib import Path

import valhalla

import make_fixture

work = Path(sys.argv[1]).resolve()
work.mkdir(parents=True, exist_ok=True)
pbf = work / "fixture.osm.pbf"
make_fixture.main(str(pbf), str(work / "points.json"))

config_json = subprocess.run(
    [
        sys.executable, "-m", "valhalla.valhalla_build_config",
        "--mjolnir-tile-dir", str(work / "tiles"),
        "--mjolnir-tile-extract", str(work / "tiles.tar"),
        # No timezone or admin databases for a synthetic network.
        "--mjolnir-timezone", "",
        "--mjolnir-admin", "",
    ],
    check=True, capture_output=True, text=True,
).stdout
config = json.loads(config_json)
config["httpd"]["service"]["listen"] = "tcp://127.0.0.1:0"  # replaced by the test harness
(work / "valhalla.json").write_text(json.dumps(config, indent=2))

bin_dir = Path(valhalla.PYVALHALLA_DIR) / "bin"
subprocess.run(
    [str(bin_dir / "valhalla_build_tiles"), "-c", str(work / "valhalla.json"), str(pbf)],
    check=True,
    stdout=subprocess.DEVNULL,
)
print(bin_dir / "valhalla_service")
