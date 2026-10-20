#!/usr/bin/env bash
# Where a server's install has got to, for the deploy workflow (run over SSH:
#   ssh root@server 'bash -s' 20 < server/scripts/deploy-status.sh
# ). Prints the containers, the tail of their logs and how HTTPS answers from
# the server itself, then one last line the workflow acts on:
#   STATUS=installing | running | container-down | install-failed | install-empty
# The argument is how many log lines to show per container (default 20).
set -uo pipefail

LINES=${1:-20}
LOG=/var/log/blue-route-install.log
DIR=/opt/blue-route/server

finished=$(grep -o 'install finished with exit code [0-9]*' "$LOG" 2>/dev/null | tail -n 1 | grep -o '[0-9]*$')
stage=$(grep '^== ' "$LOG" 2>/dev/null | tail -n 1)
echo "install: ${finished:+finished with exit code $finished}${finished:-still running${stage:+, at: $stage}}"

if ! command -v docker >/dev/null || [ ! -f "$DIR/docker-compose.yml" ]; then
  echo "docker: not set up yet"
  if [ -n "$finished" ]; then
    # The installer ended without setting anything up: show why.
    echo "--- install log"
    tail -n 40 "$LOG" 2>/dev/null
    echo "--- first-boot log"
    tail -n 40 /var/log/cloud-init-output.log 2>/dev/null
    [ "$finished" = 0 ] && echo "STATUS=install-empty" || echo "STATUS=install-failed"
  else
    echo "STATUS=installing"
  fi
  exit 0
fi

cd "$DIR"
echo "--- docker compose ps"
docker compose ps -a --format 'table {{.Service}}\t{{.State}}\t{{.Status}}' 2>&1
for service in valhalla api caddy; do
  echo "--- $service (last $LINES lines)"
  if [ "$service" = valhalla ]; then
    # Valhalla keeps no logs (they'd hold coordinates); ask it directly instead.
    if docker compose exec -T api wget -qO- -T 5 http://valhalla:8002/status >/dev/null 2>&1; then
      echo "(no logs by design) /status answers: tiles loaded"
    else
      echo "(no logs by design) /status doesn't answer"
    fi
  else
    docker compose logs --no-color --tail "$LINES" "$service" 2>&1
  fi
done

domain=$(grep -E '^DOMAIN=' .env 2>/dev/null | cut -d= -f2-)
echo "--- HTTPS from the server itself"
echo "listening: $(ss -ltnH 2>/dev/null | awk '{print $4}' | grep -oE ':(80|443)$' | sort -u | tr '\n' ' ')"
echo "firewall: $(ufw status 2>/dev/null | grep -E '^(80|443)' | tr -s ' ' | tr '\n' ';')"
if [ -n "$domain" ]; then
  echo "https://$domain/health -> $(curl -sS -m 10 --resolve "$domain:443:127.0.0.1" "https://$domain/health" 2>&1 | head -c 300)"
fi

states=$(docker compose ps -a --format '{{.Service}} {{.State}}' 2>/dev/null)
if grep -qE ' (exited|dead|restarting)$' <<<"$states"; then
  echo "STATUS=container-down"
elif [ -n "$finished" ] && [ "$finished" != 0 ]; then
  echo "STATUS=install-failed"
elif [ -n "$finished" ] && [ -z "$states" ]; then
  echo "STATUS=install-empty"
elif [ -n "$states" ]; then
  echo "STATUS=running"
else
  echo "STATUS=installing"
fi
