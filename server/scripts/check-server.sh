#!/usr/bin/env bash
# Does the BlueRoute server work? Quick checks of what officers rely on:
# /health says routing and places are ready, a London route plans, and
# address search answers. Exits 0 if all pass, 1 otherwise, printing why.
#
#   server/scripts/check-server.sh https://blueroute-you.duckdns.org
#   server/scripts/check-server.sh https://blueroute-you.duckdns.org --local
#
# --local (on the server itself, as update.sh runs it) sends the requests to
# this machine, through Caddy, whatever the domain's DNS says.
# Takes up to --wait seconds (default 0) for the server to come up first.
set -uo pipefail

BASE=${1:?Usage: check-server.sh https://your-server [--local] [--wait SECONDS]}
BASE=${BASE%/}
shift
LOCAL=0
WAIT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --local) LOCAL=1 ;;
    --wait) WAIT=$2; shift ;;
  esac
  shift
done

curl_args=(-sS -m 20)
if [ "$LOCAL" = 1 ]; then
  host=${BASE#https://}
  curl_args+=(--resolve "${host%%/*}:443:127.0.0.1")
fi
call() { curl "${curl_args[@]}" "$@"; }
fail() { echo "FAIL  $*"; exit 1; }

# The server may still be starting (after an update, a restart).
deadline=$(($(date +%s) + WAIT))
while :; do
  health=$(call "$BASE/health" 2>/dev/null || true)
  grep -q '"routing":true' <<<"$health" && grep -q '"places":true' <<<"$health" && break
  [ "$(date +%s)" -ge "$deadline" ] && fail "/health: ${health:-no answer}"
  sleep 5
done
echo "PASS  /health: $health"

# Highbury Corner to King's Cross: a route the app would plan any shift.
route=$(call -o /dev/null -w '%{http_code} %{time_total}' -X POST "$BASE/v1/routes" \
  -H 'content-type: application/json' \
  -d '{"from":{"lat":51.5463,"lng":-0.1037},"to":{"lat":51.5308,"lng":-0.1238}}' 2>/dev/null || echo "000 0")
code=${route%% *}
[ "$code" = 200 ] || fail "route Highbury Corner to King's Cross: HTTP $code"
echo "PASS  route Highbury Corner to King's Cross (${route#* } s)"

# Address search: answers, or says why not. Its providers are outside our
# control (an OS outage isn't this server's fault), so only no answer at all,
# or a crash, fails the check; anything else is a warning.
addr=$(call -X POST "$BASE/v1/addresses" -H 'content-type: application/json' \
  -d '{"query":"Caledonian Road"}' -w '\n%{http_code}' 2>/dev/null || echo "000")
code=$(tail -n 1 <<<"$addr")
case "$code" in
  200) if grep -q '"label"' <<<"$addr"; then echo "PASS  address search: Caledonian Road"
       else echo "WARN  address search: no answers for Caledonian Road"; fi ;;
  503) if grep -q 'addresses-not-configured' <<<"$addr"; then
         echo "PASS  address search isn't set up on this server (road search on the phone only)"
       else echo "WARN  address search unavailable (its providers aren't answering)"; fi ;;
  429) echo "WARN  address search rate-limited by its providers" ;;
  *) fail "address search: HTTP $code" ;;
esac
echo "All checks passed"
