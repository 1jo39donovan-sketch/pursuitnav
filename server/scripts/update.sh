#!/usr/bin/env bash
# Keeps the server on the latest tested code. Cron runs it every 5 minutes
# (scripts/cron.sh). With nothing new on main it stops in a second. With a
# new commit it takes it, rebuilds the API, restarts, and checks the server
# still works (scripts/check-server.sh: health, a London route, address
# search). If it doesn't, it goes back to the code it was running, and won't
# try that commit again: the next commit on main gets its own try.
#
# CI has to pass before code reaches main, so this only picks up tested
# changes; the checks here catch what tests can't (the real data, the box).
# Everything in main(), run on the last line, so a git pull that changes this
# file can't change it under a running bash.
main() {
set -uo pipefail

cd "$(dirname "$0")/../.."
REPO=$PWD
say() { echo "$(date -Is) $*"; }
FAILED=$REPO/server/data/update-failed

# One at a time; and not while the weekly map build is swapping tiles in
# (routing is briefly down then, and the checks would wrongly fail).
exec 9>"${UPDATE_LOCK:-/var/lock/blue-route-update.lock}"
flock -n 9 || exit 0
[ -d server/data/valhalla-next ] && exit 0
# The schedule this code wants (quick; a server set up before a schedule
# change takes it on its next run).
bash server/scripts/cron.sh || say "couldn't update the schedule"

BRANCH=${BRANCH:-main}
if ! git fetch -q origin "$BRANCH" 2>/dev/null; then
  # A server set to follow a pull request's branch carries on from main once
  # that branch is merged and deleted.
  BRANCH=main
  git fetch -q origin main || { say "can't reach GitHub; trying again in 5 minutes"; exit 0; }
fi
old=$(git rev-parse HEAD)
new=$(git rev-parse "origin/$BRANCH")
[ "$old" = "$new" ] && exit 0
[ "$(cat "$FAILED" 2>/dev/null)" = "$new" ] && exit 0

domain=$(grep -E '^DOMAIN=' server/.env | cut -d= -f2-)
say "updating ${old:0:7} -> ${new:0:7}"
if apply "$new" && bash "$REPO/server/scripts/check-server.sh" "https://$domain" --local --wait 180; then
  rm -f "$FAILED"
  say "live on ${new:0:7}"
  after_update
  exit 0
fi

say "checks failed on ${new:0:7}: going back to ${old:0:7}"
echo "$new" >"$FAILED"
if apply "$old" && bash "$REPO/server/scripts/check-server.sh" "https://$domain" --local --wait 180; then
  say "back on ${old:0:7}, working"
else
  say "still failing on ${old:0:7} after going back: needs a look"
fi
exit 1
}

# Puts the server on that commit: the code, then the API rebuilt and restarted.
apply() {
  git -C "$REPO" reset -q --hard "$1" || return 1
  cd "$REPO/server" || return 1
  # The API reports the version it runs (GET /health).
  sed -i '/^VERSION=/d' .env && echo "VERSION=${1:0:7}" >>.env
  # The API runs as the node user (uid 1000) and writes learning totals here.
  mkdir -p data/learned && chown 1000:1000 data/learned 2>/dev/null
  docker compose up -d --build --remove-orphans </dev/null || return 1
  cd "$REPO"
}

# Once a new version is live: the schedule it wants, and data it needs now.
after_update() {
  cd "$REPO/server"
  docker image prune -f >/dev/null 2>&1 || true
  bash scripts/cron.sh || say "couldn't update the schedule"
  # A new kind of search data (e.g. the named-roads list) is built now rather
  # than waiting for the weekly map refresh.
  if [ ! -s data/places/roads.txt.gz ]; then
    bash scripts/build-places.sh </dev/null || say "search data rebuild failed; the weekly refresh will retry"
  fi
  # A server from before house-number search builds it now (in the
  # background: it takes about an hour) rather than waiting for the weekly refresh.
  if ! grep -q '^NOMINATIM_DATA=' .env 2>/dev/null; then
    bash scripts/build-geocoder.sh --background </dev/null || say "couldn't start the geocoder build"
  fi
  # Live closures need Valhalla's avoid-area limits raised (new map builds do it).
  if [ "$(bash scripts/valhalla-limits.sh data/valhalla || true)" = "changed" ]; then
    docker compose restart valhalla </dev/null
  fi
}

main "$@"
