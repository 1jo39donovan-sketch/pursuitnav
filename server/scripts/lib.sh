# Helpers the data scripts share. Sourced, not run: . "$(dirname "$0")/lib.sh"
# Expects to be in the server folder (where .env and docker-compose.yml are).

NOMINATIM_IMAGE=mediagis/nominatim:5.3

say() { echo "$(date -Is) ${SAY_PREFIX:-}$*"; }

# A value from .env, or nothing.
setting() { (grep -E "^$1=" .env 2>/dev/null || true) | tail -n 1 | cut -d= -f2-; }

set_setting() {
  touch .env
  sed -i "/^$1=/d" .env
  echo "$1=$2" >>.env
}

# "1.2GiB" / "512MiB" / "800kB" -> whole MiB
mib() {
  awk -v v="$1" 'BEGIN {
    n = v + 0; u = v; sub(/^[0-9.]+/, "", u)
    if (u ~ /^GiB|^GB/) n *= 1024; else if (u ~ /^kB|^KiB/) n /= 1024; else if (u ~ /^B$/) n /= 1048576
    printf "%d", n }'
}

free_disk_mb() { df -Pm . | awk 'NR == 2 {print $4}'; }

# The house-number database not in use: data/nominatim/a or b.
inactive_geocoder_slot() {
  if [ "$(setting NOMINATIM_DATA)" = ./data/nominatim/a ]; then echo ./data/nominatim/b; else echo ./data/nominatim/a; fi
}
