#!/usr/bin/env bash
# Pulls the latest server code and restarts if it changed. Run nightly from
# cron (install.sh sets that up). CI has to pass before code reaches main,
# so this only picks up tested changes.
set -euo pipefail

cd "$(dirname "$0")/../.."
BRANCH=${BRANCH:-main}

git fetch -q origin "$BRANCH"
if [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ]; then
  exit 0
fi

echo "$(date -Is) updating to $(git rev-parse --short "origin/$BRANCH")"
git reset -q --hard "origin/$BRANCH"
cd server
docker compose up -d --build
docker image prune -f >/dev/null

# A new kind of search data (e.g. the named-roads list) is built now rather
# than waiting for the weekly map refresh.
if [ ! -s data/places/roads.txt.gz ]; then
  scripts/build-places.sh || echo "$(date -Is) search data rebuild failed; the weekly refresh will retry" >&2
fi
echo "$(date -Is) done"
