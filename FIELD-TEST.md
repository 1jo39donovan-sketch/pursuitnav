# Field test: Blue Route on a real phone in a car

Everything here has been tested on a synthetic street network and in a browser. This is the checklist for the first runs on real London streets. Do it as a passenger: the operator uses the app, the driver drives.

## 1. Server (once)

On a VPS with Docker, at least 4 GB RAM and a domain name pointing at it (see `server/README.md`):

```bash
git clone <repo> /opt/blue-route && cd /opt/blue-route/server
cp .env.example .env          # set DOMAIN, and OS_PLACES_KEY if you have one
docker compose up -d          # builds London routing tiles (~15–30 min)
scripts/build-places.sh       # shops, cafés, schools, parks… (after the tiles)
curl https://$DOMAIN/health   # {"ok":true}
```

Add the weekly rebuild to cron (in `server/README.md`).

## 2. App on an Android phone

1. In `app/eas.json`, replace `https://route.example.org` with your server's address (all three profiles).
2. Create a free Expo account, then from `app/`:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest build --profile preview --platform android
   ```
3. Open the link EAS gives you on the phone and install the APK. Allow location "While using the app".

iPhone needs an Apple developer account ($99/year) and `--platform ios`; ask before going that way.

## 3. Checklist

Tick each one; note anything odd with time and place, and send the notes back.

### Must pass (from the brief)

- [ ] Search `Stroud Green Road` with Islington selected: it's listed under Islington.
- [ ] Search `Bedminton Estate`: Bemerton Estate is found.
- [ ] Search `54 Caledonian Road` with the OS key set: the route ends at that door, not mid-road. (Without the key the app warns it's routing to the road.)
- [ ] Drive near a known one-way street and ask for a destination where going the wrong way would be quickest: neither route goes against it.
- [ ] Find a bus gate or banned turn that's on the quick way somewhere: the police route uses it, is faster, and names it.
- [ ] Journey times count from where the car is, and update as you drive.
- [ ] Pursuit mode on a road with no posted limit in OSM shows "—", not a number.
- [ ] Search, pick a route, close the app fully, reopen: the Log still has it.

### Search
- [ ] Postcode alone (`N7 8LA`) and at the end of an address.
- [ ] `N7` lists roads in N7.
- [ ] A shop by name (`Costa`), and a kind of place (`coffee shops`, `schools`).
- [ ] With signal off: roads, postcodes and places still found.

### Routes and navigation
- [ ] Police route only offered when it's meaningfully faster; each restriction listed makes sense on the ground.
- [ ] Go on a route: next turn, distance and road names are right and readable at a glance.
- [ ] Miss a turn on purpose: it re-routes within a few seconds, not with a U-turn first.
- [ ] Chose police, then go somewhere with no faster police route: it says it's following the standard route.
- [ ] Screen stays on while navigating; landscape works.

### Pursuit mode
- [ ] Speed matches the car's speedometer (GPS reads a little lower is normal).
- [ ] Speed limit roundel matches the signs; speed turns red over it.
- [ ] Road, next junction and distance are right; "generally towards" is sensible.
- [ ] Borough changes at the right places.
- [ ] Portrait and landscape both readable; screen stays on.

### Places on the map
- [ ] Places button: markers appear for the chosen kinds; tapping one routes there.

### General
- [ ] Battery use over an hour of navigation and an hour of pursuit mode.
- [ ] Mobile data use over a shift (pursuit mode asks the server once a second).
- [ ] Anything hard to read in daylight or at night.
