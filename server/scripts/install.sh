#!/usr/bin/env bash
# Sets up the Blue Route server on a fresh Ubuntu (22.04 or 24.04) VPS.
#
# Run as root, on the server:
#   curl -fsSL https://raw.githubusercontent.com/1jo39donovan-sketch/pursuitnav/main/server/scripts/install.sh | bash
#
# It asks for the domain name (already pointing at this server) and,
# optionally, a (free) OS Names API key. Safe to run again: it updates the
# code and restarts.
#
# Unattended (the GitHub "Deploy server" workflow does this): set DOMAIN, and
# optionally OS_NAMES_KEY, OS_PLACES_KEY and CONTACT_EMAIL, in the environment
# and nothing is asked.
# Everything is in main(), run on the last line: bash then reads the whole
# script before running any of it. Run as "curl … | bash", bash reads the
# script from the pipe as it goes, and a command that reads its input (docker
# compose run/exec do) swallowed the rest: the install stopped after the map
# build, with only Valhalla running, and still reported success.
main() {
set -euo pipefail

REPO=https://github.com/1jo39donovan-sketch/pursuitnav.git
BRANCH=${BRANCH:-main}
DIR=/opt/blue-route

say() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

# However the install ends, leave the containers' state and the front end's
# logs in the install log, for the deploy workflow to print.
show_state() {
  [ -f "$DIR/server/docker-compose.yml" ] && command -v docker >/dev/null || return 0
  printf '\n== Containers at the end of the install\n'
  (cd "$DIR/server" && docker compose ps -a && docker compose logs --no-color --tail 50 caddy api) 2>&1 || true
}
trap show_state EXIT

[ "$(id -u)" -eq 0 ] || fail "Run this as root (or with sudo)."


EXISTING_DOMAIN=""
[ -f "$DIR/server/.env" ] && EXISTING_DOMAIN=$(grep -E '^DOMAIN=' "$DIR/server/.env" | cut -d= -f2- || true)
if [ -z "${DOMAIN:-}" ]; then
  # Questions come from the keyboard (/dev/tty) even when this script is piped from curl.
  read -rp "Domain name for the server${EXISTING_DOMAIN:+ [$EXISTING_DOMAIN]} (e.g. route.example.org): " DOMAIN </dev/tty
  DOMAIN=${DOMAIN:-$EXISTING_DOMAIN}
  read -rp "OS Names API key (free, from the OS Data Hub; Enter to skip): " OS_NAMES_KEY </dev/tty
fi
[ -n "$DOMAIN" ] || fail "A domain name is needed for HTTPS."
OS_PLACES_KEY=${OS_PLACES_KEY:-}
OS_NAMES_KEY=${OS_NAMES_KEY:-}
# Kept from an earlier install: the house-number search's database, once
# build-geocoder.sh has made one, and where it is.
GEOCODER_SETTINGS=""
if [ -f "$DIR/server/.env" ]; then
  GEOCODER_SETTINGS=$(grep -E '^(NOMINATIM_DATA|NOMINATIM_URL|COMPOSE_PROFILES|GEOCODER_CHECK)=' "$DIR/server/.env" || true)
fi
# Contact address for the /privacy and /support pages (the app stores need one).
if [ -z "${CONTACT_EMAIL:-}" ] && [ -f "$DIR/server/.env" ]; then
  CONTACT_EMAIL=$(grep -E '^CONTACT_EMAIL=' "$DIR/server/.env" | cut -d= -f2- || true)
fi
CONTACT_EMAIL=${CONTACT_EMAIL:-}
# Which OpenStreetMap extract to build the map from (Greater London if unset).
if [ -z "${PBF_URL:-}" ] && [ -f "$DIR/server/.env" ]; then
  PBF_URL=$(grep -E '^PBF_URL=' "$DIR/server/.env" | cut -d= -f2- || true)
fi
PBF_URL=${PBF_URL:-}
# Optional TfL API key for live road closures (they work without one, but may be throttled).
if [ -z "${TFL_APP_KEY:-}" ] && [ -f "$DIR/server/.env" ]; then
  TFL_APP_KEY=$(grep -E '^TFL_APP_KEY=' "$DIR/server/.env" | cut -d= -f2- || true)
fi
TFL_APP_KEY=${TFL_APP_KEY:-}
# Token for GET /stats (usage counts); /stats is off without one.
if [ -z "${STATS_TOKEN:-}" ] && [ -f "$DIR/server/.env" ]; then
  STATS_TOKEN=$(grep -E '^STATS_TOKEN=' "$DIR/server/.env" | cut -d= -f2- || true)
fi
STATS_TOKEN=${STATS_TOKEN:-}

say "Installing Docker and basics"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw dnsutils cron >/dev/null
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker cron >/dev/null

say "Checking $DOMAIN points at this server"
MY_IP=$(curl -fsS https://api.ipify.org || true)
# A just-updated record can take a minute or two to show.
for i in $(seq 1 20); do
  DNS_IP=$(dig +short A "$DOMAIN" @1.1.1.1 | tail -n 1)
  if [ -n "$DNS_IP" ] && { [ -z "$MY_IP" ] || [ "$DNS_IP" = "$MY_IP" ]; }; then break; fi
  [ "$i" -lt 20 ] && sleep 15
done
if [ -z "$DNS_IP" ]; then
  fail "$DOMAIN doesn't resolve yet. Add an A record for it pointing at ${MY_IP:-the IP address of this server}, wait a few minutes, and run this again."
elif [ -n "$MY_IP" ] && [ "$DNS_IP" != "$MY_IP" ]; then
  fail "$DOMAIN points at $DNS_IP but this server is $MY_IP. Fix the A record, wait a few minutes, and run this again."
fi
echo "OK: $DOMAIN -> $DNS_IP"

say "Firewall: SSH, HTTP and HTTPS only"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443 >/dev/null
ufw --force enable >/dev/null

# Building London's routing tiles needs more memory than serving them.
TOTAL_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$TOTAL_MB" -lt 7000 ] && ! swapon --show | grep -q /swapfile; then
  say "Adding 4 GB of swap for the map build (this server has ${TOTAL_MB} MB RAM)"
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

say "Getting the code ($BRANCH)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" checkout -q "$BRANCH"
  git -C "$DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR/server"
[ -f docker-compose.yml ] || fail "No server code on branch $BRANCH. Merge the pull request into main first, or run with BRANCH=<branch>."

umask 077
printf 'DOMAIN=%s\nOS_NAMES_KEY=%s\nOS_PLACES_KEY=%s\nCONTACT_EMAIL=%s\nPBF_URL=%s\nTFL_APP_KEY=%s\nSTATS_TOKEN=%s\n' "$DOMAIN" "$OS_NAMES_KEY" "$OS_PLACES_KEY" "$CONTACT_EMAIL" "$PBF_URL" "$TFL_APP_KEY" "$STATS_TOKEN" >.env
[ -n "$GEOCODER_SETTINGS" ] && printf '%s\n' "$GEOCODER_SETTINGS" >>.env
umask 022

say "Building the routing map and places list. This takes 20–40 minutes the first time."
if [ -s data/valhalla/valhalla_tiles.tar ]; then
  echo "Map already built; the weekly refresh keeps it current."
else
  bash scripts/build-map.sh </dev/null
fi

say "Starting Valhalla, the API and HTTPS"
# The API runs as the node user (uid 1000) and writes learning totals here.
mkdir -p data/learned && chown 1000:1000 data/learned
docker compose up -d --build </dev/null
for i in $(seq 1 60); do
  if docker compose exec -T api wget -qO- http://valhalla:8002/status </dev/null >/dev/null 2>&1; then
    echo "Routing ready."
    break
  fi
  [ "$i" -eq 60 ] && fail "Valhalla isn't answering. Check: docker compose ps"
  sleep 5
done

if ! grep -q '^NOMINATIM_DATA=' .env; then
  say "Building the house-number search in the background (about an hour; log: /var/log/blue-route-geocoder.log)"
  bash scripts/build-geocoder.sh --background </dev/null
fi

say "Weekly map and places refresh (Sundays 03:15); nightly code update from $BRANCH (04:30)"
cat >/etc/cron.d/blue-route <<EOF
15 3 * * 0 root bash $DIR/server/scripts/rebuild-tiles.sh >> /var/log/blue-route-tiles.log 2>&1
30 4 * * * root BRANCH=$BRANCH bash $DIR/server/scripts/update.sh >> /var/log/blue-route-update.log 2>&1
EOF
chmod 644 /etc/cron.d/blue-route

say "Checking HTTPS"
for i in $(seq 1 20); do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then
    echo "https://$DOMAIN/health is answering."
    printf '\n\033[1;32mBlue Route server is up at https://%s\033[0m\n' "$DOMAIN"
    echo "Next: put https://$DOMAIN into app/eas.json (or tell Claude) and build the app."
    exit 0
  fi
  sleep 6
done
fail "HTTPS isn't answering yet. The certificate can take a minute; check with: docker compose logs caddy"
}

main "$@"
