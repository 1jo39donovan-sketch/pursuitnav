"""fetch-data.sh against fake data releases (packed by the real data-package.sh,
served from files): a new server gets its data put in place; a running one
swaps in a new release and goes back to the old map if the checks fail; a
damaged download is refused; a region GitHub doesn't build is left to the
server. pytest server/scripts"""

import json
import os
import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = ("lib.sh", "fetch-data.sh", "data-package.sh", "map-switch.sh", "geocoder-switch.sh")


def make_server(tmp_path):
    """A server folder with the real scripts, a docker that does nothing, and a check that passes."""
    server = tmp_path / "server"
    (server / "scripts").mkdir(parents=True)
    for name in SCRIPTS:
        shutil.copy(HERE / name, server / "scripts" / name)
    (server / "scripts/check-server.sh").write_text("exit 0\n")
    (server / ".env").write_text("DOMAIN=test.example\n")
    (server / "data").mkdir()
    bin_ = tmp_path / "bin"
    bin_.mkdir()
    (bin_ / "docker").write_text(f"#!/bin/sh\necho \"$*\" >> {tmp_path}/docker.log\n")
    (bin_ / "docker").chmod(0o755)
    (bin_ / "sleep").write_text("#!/bin/sh\nexit 0\n")  # no waiting in tests
    (bin_ / "sleep").chmod(0o755)
    return server, bin_


def env(tmp_path, bin_):
    return {**os.environ, "PATH": f"{bin_}:{os.environ['PATH']}",
            "DATA_RELEASES_API": f"file://{tmp_path}/releases.json",
            "DATA_DOWNLOAD_BASE": f"file://{tmp_path}/dl"}


def publish(tmp_path, server, bin_, tag, content):
    """Builds a release the way data.yml does: data-package.sh over built folders."""
    work = tmp_path / f"build-{tag}"
    (work / "scripts").mkdir(parents=True)
    for name in SCRIPTS:
        shutil.copy(HERE / name, work / "scripts" / name)
    (work / "data/valhalla-next").mkdir(parents=True)
    (work / "data/valhalla-next/valhalla_tiles.tar").write_text(f"tiles {content}")
    (work / "data/places-next").mkdir(parents=True)
    (work / "data/places-next/places.txt.gz").write_text(f"places {content}")
    (work / "data/places-next/roads.txt.gz").write_text(f"roads {content}")
    (work / "data/nominatim/a").mkdir(parents=True)
    (work / "data/nominatim/a/PG_VERSION").write_text(f"16 {content}")
    subprocess.run(["bash", str(work / "scripts/data-package.sh"), "./data/nominatim/a", "data/release"],
                   cwd=work, check=True, capture_output=True, env=env(tmp_path, bin_))
    out = tmp_path / "dl" / tag
    shutil.copytree(work / "data/release", out)
    tags = [{"tag_name": tag, "draft": False}]
    if (tmp_path / "releases.json").exists():
        tags += json.loads((tmp_path / "releases.json").read_text())
    (tmp_path / "releases.json").write_text(json.dumps(tags))


def fetch(tmp_path, server, bin_):
    return subprocess.run(["bash", str(server / "scripts/fetch-data.sh")], capture_output=True, text=True,
                          env=env(tmp_path, bin_))


def setting(server, key):
    for line in (server / ".env").read_text().splitlines():
        if line.startswith(key + "="):
            return line.split("=", 1)[1]
    return None


def test_a_new_server_gets_its_data_in_place(tmp_path):
    server, bin_ = make_server(tmp_path)
    publish(tmp_path, server, bin_, "data-20261025-0100", "one")
    result = fetch(tmp_path, server, bin_)
    assert result.returncode == 0, result.stdout + result.stderr
    assert (server / "data/valhalla/valhalla_tiles.tar").read_text() == "tiles one"
    assert (server / "data/places/roads.txt.gz").read_text() == "roads one"
    assert (server / "data/nominatim/a/PG_VERSION").read_text() == "16 one"
    assert setting(server, "NOMINATIM_DATA") == "./data/nominatim/a"
    assert setting(server, "COMPOSE_PROFILES") == "geocoder"
    assert (server / "data/data-release").read_text().strip() == "data-20261025-0100"
    assert not (server / "data/download").exists()
    # Nothing new: nothing to do.
    again = fetch(tmp_path, server, bin_)
    assert again.returncode == 0 and "already on" in again.stdout


def test_a_running_server_swaps_in_the_newest_release(tmp_path):
    server, bin_ = make_server(tmp_path)
    publish(tmp_path, server, bin_, "data-20261025-0100", "one")
    fetch(tmp_path, server, bin_)
    publish(tmp_path, server, bin_, "data-20261101-0100", "two")
    result = fetch(tmp_path, server, bin_)
    assert result.returncode == 0, result.stdout + result.stderr
    assert (server / "data/valhalla/valhalla_tiles.tar").read_text() == "tiles two"
    assert (server / "data/valhalla-prev/valhalla_tiles.tar").read_text() == "tiles one"
    assert (server / "data/places/places.txt.gz").read_text() == "places two"
    # The other database folder, now live; the old one deleted once it answered.
    assert setting(server, "NOMINATIM_DATA") == "./data/nominatim/b"
    assert (server / "data/nominatim/b/PG_VERSION").read_text() == "16 two"
    assert not (server / "data/nominatim/a").exists()
    assert (server / "data/data-release").read_text().strip() == "data-20261101-0100"


def test_goes_back_to_the_old_map_if_the_checks_fail(tmp_path):
    server, bin_ = make_server(tmp_path)
    publish(tmp_path, server, bin_, "data-20261025-0100", "one")
    fetch(tmp_path, server, bin_)
    publish(tmp_path, server, bin_, "data-20261101-0100", "two")
    (server / "scripts/check-server.sh").write_text("exit 1\n")
    result = fetch(tmp_path, server, bin_)
    assert result.returncode == 1
    assert (server / "data/valhalla/valhalla_tiles.tar").read_text() == "tiles one"
    assert (server / "data/data-release").read_text().strip() == "data-20261025-0100"  # tried again tomorrow


def test_refuses_a_damaged_download(tmp_path):
    server, bin_ = make_server(tmp_path)
    publish(tmp_path, server, bin_, "data-20261025-0100", "one")
    part = next((tmp_path / "dl/data-20261025-0100").glob("valhalla.tar.zst.part*"))
    part.write_bytes(part.read_bytes()[:-10] + b"0123456789")
    result = fetch(tmp_path, server, bin_)
    assert result.returncode == 1 and "damaged" in result.stdout
    assert not (server / "data/valhalla").exists() and not (server / "data/data-release").exists()


def test_leaves_other_regions_and_missing_releases_to_the_server(tmp_path):
    server, bin_ = make_server(tmp_path)
    (tmp_path / "releases.json").write_text("[]")
    assert fetch(tmp_path, server, bin_).returncode == 2
    (server / ".env").write_text("DOMAIN=t\nPBF_URL=https://download.geofabrik.de/europe/ireland-and-northern-ireland-latest.osm.pbf\n")
    assert fetch(tmp_path, server, bin_).returncode == 2
