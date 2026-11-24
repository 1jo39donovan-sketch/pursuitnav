#!/usr/bin/env bash
# Keeps a copy of the newest Android test app on this server, so testers can
# install it from https://<server>/android without a GitHub login (the
# repository's release page needs one once the repository is private).
#
# The "Android app" workflow (android.yml) still builds the APK and puts it
# on the android-latest release; this takes it from there when it changes.
# Cron runs it hourly (scripts/cron.sh). Caddy serves data/apk (Caddyfile).
#
# Exits 0 when the newest APK is here (or already was), 1 if it failed.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh
. scripts/github-auth.sh
SAY_PREFIX="apk: "
github_auth .env

slug=$( (git remote get-url origin 2>/dev/null || true) | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
API=${APK_RELEASE_API:-https://api.github.com/repos/$slug/releases/tags/android-latest}
NAME=blue-route.apk

mkdir -p data/apk
exec 9>data/apk/.lock
flock -n 9 || { say "already fetching"; exit 0; }

release=$(curl -fsSL --retry 3 "${GH_CURL_AUTH[@]}" "$API") || { say "can't reach the Android app release"; exit 1; }
# name, API url, public download url, when it was uploaded.
read -r api_url public_url updated < <(python3 -c '
import json, sys
r = json.load(sys.stdin)
for a in r.get("assets", []):
    if a["name"] == sys.argv[1]:
        print(a["url"], a["browser_download_url"], a["updated_at"])' "$NAME" <<<"$release") ||
  { say "no $NAME on the release yet"; exit 1; }

[ "$updated" = "$(cat data/apk/version 2>/dev/null)" ] && [ -s data/apk/blueroute.apk ] && exit 0

tmp=data/apk/download.apk
rm -f "$tmp"
trap 'rm -f "$tmp"' EXIT
if [ "$GH_TOKEN_SET" = 1 ]; then
  curl -fsSL --retry 5 "${GH_CURL_AUTH[@]}" -H "Accept: application/octet-stream" -o "$tmp" "$api_url"
else
  curl -fsSL --retry 5 -o "$tmp" "$public_url"
fi
# An APK is a zip file: anything else (an error page) isn't served.
[ "$(head -c 2 "$tmp")" = "PK" ] || { say "the download isn't an APK: keeping the previous one"; exit 1; }
chmod 644 "$tmp"
mv "$tmp" data/apk/blueroute.apk
echo "$updated" >data/apk/version
say "new APK in place (uploaded $updated)"
