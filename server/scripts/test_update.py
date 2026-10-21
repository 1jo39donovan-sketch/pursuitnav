"""update.sh against a fake server: a commit whose checks fail is rolled back and
not tried again; the next good commit goes live. pytest server/scripts"""

import os
import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent


def git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True,
                   env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                        "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"})


def commit(work, checks_pass, message):
    """A commit whose server checks pass or fail (check-server.sh is in the commit, as in real life)."""
    (work / "server/scripts/check-server.sh").write_text(f"exit {0 if checks_pass else 1}\n")
    (work / "version.txt").write_text(message)
    git(work, "add", "-A")
    git(work, "commit", "-qm", message)
    git(work, "push", "-q", "origin", "HEAD:main")
    return subprocess.run(["git", "rev-parse", "HEAD"], cwd=work, capture_output=True, text=True).stdout.strip()


def setup(tmp_path):
    origin, work, server = tmp_path / "origin.git", tmp_path / "work", tmp_path / "server"
    git(tmp_path, "init", "-q", "--bare", "-b", "main", str(origin))
    git(tmp_path, "clone", "-q", str(origin), str(work))
    scripts = work / "server/scripts"
    scripts.mkdir(parents=True)
    shutil.copy(HERE / "update.sh", scripts / "update.sh")
    for stub in ("cron.sh", "build-places.sh", "build-geocoder.sh", "valhalla-limits.sh"):
        (scripts / stub).write_text("exit 0\n")
    (work / ".gitignore").write_text("server/.env\nserver/data/\n")
    good = commit(work, True, "first")
    git(tmp_path, "clone", "-q", str(origin), str(server))
    (server / "server/.env").write_text("DOMAIN=test.example\nNOMINATIM_DATA=./x\n")
    (server / "server/data/places").mkdir(parents=True)
    (server / "server/data/places/roads.txt.gz").write_text("x")
    # A docker that does nothing but note it was asked to rebuild.
    bin_ = tmp_path / "bin"
    bin_.mkdir()
    (bin_ / "docker").write_text(f"#!/bin/sh\necho \"$*\" >> {tmp_path}/docker.log\n")
    (bin_ / "docker").chmod(0o755)
    return work, server, good, bin_


def run_update(tmp_path, server, bin_):
    return subprocess.run(["bash", str(server / "server/scripts/update.sh")], capture_output=True, text=True,
                          env={**os.environ, "PATH": f"{bin_}:{os.environ['PATH']}",
                               "UPDATE_LOCK": str(tmp_path / "update.lock")})


def head(server):
    return subprocess.run(["git", "rev-parse", "HEAD"], cwd=server, capture_output=True, text=True).stdout.strip()


def docker_calls(tmp_path):
    log = tmp_path / "docker.log"
    return log.read_text().count("compose up") if log.exists() else 0


def test_nothing_new_does_nothing(tmp_path):
    work, server, good, bin_ = setup(tmp_path)
    assert run_update(tmp_path, server, bin_).returncode == 0
    assert head(server) == good and docker_calls(tmp_path) == 0


def test_a_failing_update_rolls_back_and_isnt_retried(tmp_path):
    work, server, good, bin_ = setup(tmp_path)
    bad = commit(work, False, "broken")
    result = run_update(tmp_path, server, bin_)
    assert result.returncode == 1
    assert head(server) == good  # back on the version that worked
    assert "going back" in result.stdout
    assert (server / "server/data/update-failed").read_text().strip() == bad
    assert "VERSION=" + good[:7] in (server / "server/.env").read_text()
    calls = docker_calls(tmp_path)
    assert calls == 2  # the bad version, then the good one again
    # Five minutes later: the same broken commit isn't tried again.
    assert run_update(tmp_path, server, bin_).returncode == 0
    assert docker_calls(tmp_path) == calls and head(server) == good


def test_the_next_good_commit_goes_live(tmp_path):
    work, server, good, bin_ = setup(tmp_path)
    commit(work, False, "broken")
    run_update(tmp_path, server, bin_)
    fixed = commit(work, True, "fixed")
    result = run_update(tmp_path, server, bin_)
    assert result.returncode == 0, result.stdout + result.stderr
    assert head(server) == fixed and "live on" in result.stdout
    assert not (server / "server/data/update-failed").exists()
    assert "VERSION=" + fixed[:7] in (server / "server/.env").read_text()


def test_waits_while_the_weekly_map_build_runs(tmp_path):
    work, server, good, bin_ = setup(tmp_path)
    commit(work, True, "new")
    (server / "server/data/valhalla-next").mkdir()
    assert run_update(tmp_path, server, bin_).returncode == 0
    assert head(server) == good and docker_calls(tmp_path) == 0
