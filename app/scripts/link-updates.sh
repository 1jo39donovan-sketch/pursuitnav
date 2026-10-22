#!/usr/bin/env bash
# Links the app to its Expo project and turns on over-the-air updates
# (expo-updates, served by EAS Update), so a change to the app's own code
# reaches officers' phones the next time they open it, without a new install.
#
# Run before every build of the app and before every update: both then
# describe the same app, so the update's runtime version (a fingerprint of
# the native code, app.json "runtimeVersion") matches the build's, and a
# phone only ever downloads an update made for the app it has. A change to
# native code (a new library, a permission) gives a new fingerprint: phones
# then need a new build, and updates for it don't reach the old one.
#
# Changes app.json in the working copy only. Never commit the result: the
# Expo project belongs to whoever's EXPO_TOKEN runs it.
#   bash scripts/link-updates.sh                 (CI: needs EXPO_TOKEN)
#   bash scripts/link-updates.sh --interactive   (signed in with eas login)
set -euo pipefail
cd "$(dirname "$0")/.."

CHANNEL=${UPDATES_CHANNEL:-production}
args=(--force)
[ "${1:-}" = --interactive ] || args+=(--non-interactive)
npx --yes eas-cli@latest init "${args[@]}"

node -e '
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("app.json", "utf8"));
const id = cfg.expo.extra?.eas?.projectId;
if (!id) { console.error("No Expo project ID in app.json after eas init"); process.exit(1); }
cfg.expo.updates = {
  ...cfg.expo.updates,
  enabled: true,
  url: `https://u.expo.dev/${id}`,
  // Builds made on GitHub (android.yml) have no EAS build profile to name a
  // channel, so every build names it here, the same way.
  requestHeaders: { "expo-channel-name": process.argv[1] },
};
fs.writeFileSync("app.json", JSON.stringify(cfg, null, 2) + "\n");
console.log(`Over-the-air updates on: project ${id}, channel ${process.argv[1]}`);
' "$CHANNEL"
