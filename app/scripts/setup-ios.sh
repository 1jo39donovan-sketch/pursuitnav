#!/usr/bin/env bash
# One-off iOS setup, run once in a terminal (GitHub Codespaces works, no Mac
# needed): signs in to Expo and Apple, lets Expo create the signing
# certificate and the App Store Connect app, builds, and sends the build to
# TestFlight. After this, the "Store builds" GitHub workflow does every
# later build without asking anything. See STORE.md.
#
#   bash app/scripts/setup-ios.sh blueroute-yourname.duckdns.org
set -euo pipefail

DOMAIN=${1:-}
[ -n "$DOMAIN" ] || { echo "Usage: bash app/scripts/setup-ios.sh <server domain, e.g. blueroute-yourname.duckdns.org>"; exit 1; }

cd "$(dirname "$0")/.."
npm ci --no-audit --no-fund

# Build against the real server without changing the file in git.
cp eas.json "${TMPDIR:-/tmp}/eas.json.bak"
trap 'cp "${TMPDIR:-/tmp}/eas.json.bak" eas.json' EXIT
node -e '
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("eas.json", "utf8"));
cfg.build.production.env.EXPO_PUBLIC_API_URL = "https://" + process.argv[1];
fs.writeFileSync("eas.json", JSON.stringify(cfg, null, 2) + "\n");
' "$DOMAIN"

echo
echo "== Sign in to your Expo account"
npx --yes eas-cli@latest whoami >/dev/null 2>&1 || npx --yes eas-cli@latest login
echo
echo "== Link the Expo project"
npx --yes eas-cli@latest init --force
echo
echo "== Build for iOS and send to TestFlight"
echo "When asked, sign in with your Apple developer account and say yes to"
echo "letting Expo create the certificate, provisioning profile and app."
npx --yes eas-cli@latest build --platform ios --profile production --auto-submit

echo
echo "Done. In App Store Connect, open the app: the number after /apps/ in the"
echo "address is its App ID. Add it to GitHub as the ASC_APP_ID variable (STORE.md)."
