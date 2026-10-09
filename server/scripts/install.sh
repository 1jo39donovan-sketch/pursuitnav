#!/usr/bin/env bash
# Sets up the Blue Route server on a fresh Ubuntu (22.04 or 24.04) VPS.
#
# Run as root, on the server:
#   curl -fsSL https://raw.githubusercontent.com/1jo39donovan-sketch/pursuitnav/main/server/scripts/install.sh | bash
#
# It asks for the domain name (already pointing at this server) and,
# optionally, an OS Places API key. Safe to run again: it updates the code
# and restarts.
set -euo pipefail

REPO=https://github.com/1jo39donovan-sketch/pursuitnav.git
BRANCH=${BRANCH:-main}
DIR=/opt/blue-route

say() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Run this as root (or with sudo)."


EXISTING_DOMAIN=""
[ -f "$DIR/server/.env" ] && EXISTING_DOMAIN=$(grep -E '^DOMAIN=' "$DIR/server/.env" | cut -d= -f2- || true)
# Questions come from the keyboard (/dev/tty) even when this script is piped from curl.
read -rp "Domain name for the server${EXISTING_DOMAIN:+ [$EXISTING_DOMAIN]} (e.g. route.example.org): " DOMAIN </dev/tty
DOMAIN=${DOMAIN:-$EXISTING_DOMAIN}
[ -n "$DOMAIN" ] || fail "A domain name is needed for HTTPS."
read -rp "OS Places API key (press Enter to skip; road-level search still works): " OS_PLACES_KEY </dev/tty

say "Installing Docker and basics"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw dnsutils cron >/dev/null
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker cron >/dev/null

say "Checking $DOMAIN points at this server"
MY_IP=$(curl -fsS https://api.ipify.org || true)
DNS_IP=$(dig +short A "$DOMAIN" | tail -n 1)
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
printf 'DOMAIN=%s\nOS_PLACES_KEY=%s\n' "$DOMAIN" "$OS_PLACES_KEY" >.env
umask 022

say "Starting Valhalla, the API and HTTPS"
docker compose up -d --build

say "Building London's routing map. This takes 15–30 minutes the first time."
for i in $(seq 1 120); do
  if docker compose exec -T api wget -qO- http://valhalla:8002/status >/dev/null 2>&1; then
    echo "Routing map ready."
    break
  fi
  [ "$i" -eq 120 ] && fail "Valhalla still isn't up after an hour. Check: docker compose ps"
  printf '.'
  sleep 30
done

say "Extracting shops, cafés, schools, parks and other places"
scripts/build-places.sh

say "Weekly refresh of map and places (Sundays 03:15)"
cat >/etc/cron.d/blue-route <<EOF
15 3 * * 0 root $DIR/server/scripts/rebuild-tiles.sh >> /var/log/blue-route-tiles.log 2>&1
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
