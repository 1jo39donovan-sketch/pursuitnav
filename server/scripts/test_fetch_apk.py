"""fetch-apk.sh against a fake android-latest release, served from files: the
APK is copied once and again only when a new one is uploaded; something that
isn't an APK is refused; with a read-only key it comes through the API.
pytest server/scripts"""

import json
import os
import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent


def make_server(tmp_path, env_text="DOMAIN=test.example\n"):
    server = tmp_path / "server"
    (server / "scripts").mkdir(parents=True)
    for name in ("lib.sh", "github-auth.sh", "fetch-apk.sh"):
        shutil.copy(HERE / name, server / "scripts" / name)
    (server / ".env").write_text(env_text)
    bin_ = tmp_path / "bin"
    bin_.mkdir()
    real = shutil.which("curl")
    (bin_ / "curl").write_text(f'#!/bin/sh\necho "$*" >> {tmp_path}/curl.log\nexec {real} "$@"\n')
    (bin_ / "curl").chmod(0o755)
    return server, bin_


def upload(tmp_path, content, when):
    """The release as the API describes it: the file both as a plain link and as an API asset."""
    (tmp_path / "public").mkdir(exist_ok=True)
    (tmp_path / "api").mkdir(exist_ok=True)
    (tmp_path / "public/blue-route.apk").write_bytes(content)
    (tmp_path / "api/asset").write_bytes(content)
    release = {"tag_name": "android-latest", "assets": [{
        "name": "blue-route.apk", "url": f"file://{tmp_path}/api/asset",
        "browser_download_url": f"file://{tmp_path}/public/blue-route.apk", "updated_at": when}]}
    (tmp_path / "release.json").write_text(json.dumps(release))


def fetch(tmp_path, server, bin_):
    return subprocess.run(["bash", str(server / "scripts/fetch-apk.sh")], capture_output=True, text=True,
                          env={**os.environ, "PATH": f"{bin_}:{os.environ['PATH']}",
                               "APK_RELEASE_API": f"file://{tmp_path}/release.json"})


def test_copies_the_newest_apk_once(tmp_path):
    server, bin_ = make_server(tmp_path)
    upload(tmp_path, b"PK one", "2026-11-24T10:00:00Z")
    result = fetch(tmp_path, server, bin_)
    assert result.returncode == 0, result.stdout + result.stderr
    assert (server / "data/apk/blueroute.apk").read_bytes() == b"PK one"
    downloads = (tmp_path / "curl.log").read_text().count("blue-route.apk")
    # Nothing new: nothing downloaded.
    assert fetch(tmp_path, server, bin_).returncode == 0
    assert (tmp_path / "curl.log").read_text().count("blue-route.apk") == downloads
    upload(tmp_path, b"PK two", "2026-11-25T10:00:00Z")
    assert fetch(tmp_path, server, bin_).returncode == 0
    assert (server / "data/apk/blueroute.apk").read_bytes() == b"PK two"


def test_refuses_something_that_isnt_an_apk(tmp_path):
    server, bin_ = make_server(tmp_path)
    upload(tmp_path, b"PK one", "2026-11-24T10:00:00Z")
    fetch(tmp_path, server, bin_)
    upload(tmp_path, b"<html>Not Found</html>", "2026-11-25T10:00:00Z")
    result = fetch(tmp_path, server, bin_)
    assert result.returncode == 1 and "isn't an APK" in result.stdout
    assert (server / "data/apk/blueroute.apk").read_bytes() == b"PK one"


def test_a_private_repository_is_read_with_the_servers_key(tmp_path):
    server, bin_ = make_server(tmp_path, "DOMAIN=test.example\nGITHUB_READ_TOKEN=github_pat_test\n")
    upload(tmp_path, b"PK one", "2026-11-24T10:00:00Z")
    (tmp_path / "public/blue-route.apk").unlink()  # no plain link for a private repository
    result = fetch(tmp_path, server, bin_)
    assert result.returncode == 0, result.stdout + result.stderr
    assert (server / "data/apk/blueroute.apk").read_bytes() == b"PK one"
    calls = (tmp_path / "curl.log").read_text().splitlines()
    assert calls and all("Authorization: Bearer github_pat_test" in c for c in calls)
