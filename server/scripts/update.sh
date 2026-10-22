#!/usr/bin/env bash
# Pulls the latest server code and restarts if it changed. Run nightly from
# cron (install.sh sets that up). CI has to pass before code reaches main,
# so this only picks up tested changes.
set -euo pipefail

cd "$(dirname "$0")/../.."
BRANCH=${BRANCH:-main}

# A server deployed from a pull request's branch carries on from main once
# that branch is merged and deleted.
if ! git fetch -q origin "$BRANCH" 2>/dev/null; then
  echo "$(date -Is) branch $BRANCH is gone; following main" >&2
  BRANCH=main
  sed -i "s/BRANCH=[^ ]* bash/BRANCH=main bash/" /etc/cron.d/blue-route 2>/dev/null || true
  git fetch -q origin "$BRANCH"
  git checkout -q -B "$BRANCH" "origin/$BRANCH"
fi
if [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ]; then
  exit 0
fi

echo "$(date -Is) updating to $(git rev-parse --short "origin/$BRANCH")"
git reset -q --hard "origin/$BRANCH"
cd server
# The API runs as the node user (uid 1000) and writes learning totals here.
mkdir -p data/learned && chown 1000:1000 data/learned
docker compose up -d --build
docker image prune -f >/dev/null

# A new kind of search data (e.g. the named-roads list) is built now rather
# than waiting for the weekly map refresh.
if [ ! -s data/places/roads.txt.gz ]; then
  bash scripts/build-places.sh || echo "$(date -Is) search data rebuild failed; the weekly refresh will retry" >&2
fi
# A server from before house-number search builds it now (in the background:
# it takes about an hour) rather than waiting for the weekly refresh.
if ! grep -q '^NOMINATIM_DATA=' .env 2>/dev/null; then
  bash scripts/build-geocoder.sh --background || echo "$(date -Is) couldn't start the geocoder build" >&2
fi
# Live closures need Valhalla's avoid-area limits raised (new map builds do it).
if [ "$(bash scripts/valhalla-limits.sh data/valhalla || true)" = "changed" ]; then
  docker compose restart valhalla
fi
echo "$(date -Is) done"
