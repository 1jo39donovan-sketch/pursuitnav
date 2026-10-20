# Blue Route: police patrol and pursuit navigation

## What this is

**Key aim: get the officer or crew from A to B quickly and safely.** Every feature and screen is judged against that, and against being usable in the heat of going to a call: few taps, big targets, glanceable text, spoken directions.

A phone app for Met Police officers on patrol and in pursuits, widening to fire and ambulance crews. Officers currently use Google Maps, which doesn't understand borough boundaries, police routing or pursuit needs. Blue Route fixes that.

Officers install it on their own phones and use it off their own back. It is not a force system. The passenger, the **operator**, normally runs the app and gives the driver directions, on the way to calls as well as in pursuits, so screens can be information-dense.

Scope for v1 is **London only**. The whole UK comes next, then Ireland and beyond, so don't hard-code London where a config value would do. The plan is in `docs/ROADMAP.md`.

The clickable prototype (design reference only, not code to reuse) is at https://claude.ai/artifact/Lu3d7jjV51VvAv5eHs2Lz6. Keep its look: dark navy background, amber accent, condensed display font for big numbers, bottom tab bar (Session / Search / Pursuit / Log).

## Stack

- **App:** React Native with Expo, TypeScript. MapLibre (`@maplibre/maplibre-react-native`) for maps, `expo-location` for GPS, `expo-sqlite` for on-device storage, `expo-keep-awake` in navigation and pursuit. MapLibre needs an Expo development build, not Expo Go.
- **Server:** one small VPS (around £5–10/month) running Docker:
  - **Valhalla** routing engine, built from the Geofabrik Greater London OpenStreetMap extract, rebuilt weekly.
  - A small **TypeScript API** (Fastify or similar) that the app talks to. It calls Valhalla and the OS Places API, so API keys never ship in the app.
- **Map tiles:** free vector tiles (OpenFreeMap, or a self-hosted Protomaps London extract). Dark style to match the app.

## Session

At start of shift the officer enters a callsign and picks the boroughs they're working (all 32 boroughs plus City of London as chips). Both persist between launches. The selected boroughs filter all address search results.

## Address search

Officers type what the control room gave them. All of these must work:

- Road: `Stroud Green Road`, `stroud green rd`
- House number: `54 Caledonian Road`
- Flat: `Flat 3, 54 Caledonian Rd`
- Postcode, alone or at the end: `N7 8LA`, `54 Caledonian Road, N7 8LA`
- Outward code: `N7` (roads in that district)
- Block or estate by name: `Bemerton Estate`, `Smith House, Holloway Road`
- Misspellings: `Bedminton Estate` should find Bemerton Estate

Data sources:

- **OS Places API** for full addresses down to door and flat level, including named buildings. Filter to the selected boroughs by local authority (local custodian code). Confirm the codes and the current free allowance and licence terms on the OS Data Hub before building on it.
- **OS Open Names** (free, Open Government Licence) as an offline fallback for road-level search, so search still works with no signal. The prototype bundled this, assigned to boroughs by point-in-polygon against London borough boundaries.
- **Officer-saved places:** officers can add a block or estate and the road it's on. Stored on the phone, included in search.

## Places

Officers can also search for any named place: businesses (coffee shops, corner shops, takeaways, pubs, bookmakers…), schools, parks, health services, police and fire stations, stations, places of worship, hotels, named blocks and estates, and areas. Everything OpenStreetMap has a name for, where possible.

- Search by name (misspellings forgiven), or list a kind of place in the selected boroughs ("coffee shops", "schools", "corner shops").
- Source: OpenStreetMap, extracted on the server from the same weekly Geofabrik London file as the routing tiles, each place assigned to its borough. The app downloads the file and keeps it, so place search works with no signal.
- OS Places results also show business names where OS has them.

Results in the selected boroughs show first. Matches outside the area are hidden behind a "Show N outside your area" option, because roads like Stroud Green Road cross borough boundaries.

## Routing

Origin is always the phone's **current GPS position**. Every search returns two routes side by side.

**Standard route:** fully legal, Valhalla `auto` costing.

**Police route:** Valhalla `bus` costing with:
- `ignore_restrictions: true` (turn restrictions such as no right turn and left turn only are ignored)
- `ignore_oneways: false`
- vehicle dimensions from the chosen vehicle profile, not a bus

**Vehicle profile.** Chosen on Session: car, SUV, van, carrier, ambulance or fire appliance. Both routes must never use a bridge too low, a road too narrow, or a bridge too weak for it. Valhalla's `ignore_restrictions` drops these limits along with turn restrictions, so the server checks every road on a route against its signed limits and re-routes; tests prove it.

**Main roads.** Blue-light drives are quicker on main roads (width, traffic pulling over, bus lanes) than on side streets with the same signed limit. The map build adds realistic travel speeds per road type (`maxspeed:practical`), which learned speeds will replace.

This allows bus lanes, bus-only roads and bus gates. **The police route must never travel the wrong way down a one-way street.** Check the Valhalla docs for the current option names and behaviour, and write tests that prove one-ways are respected.

Blue-light routes are **on by default, by design** (a switch on Session turns them off). The police route (shown as "Blue light") is offered beside the standard route only when it is meaningfully faster, never instead of it: the standard route can still be picked for every journey. It shows the time saved and lists each restricted manoeuvre or bus-only section it uses, with location (e.g. "No right turn: Upper Street into Islington Green"). Work out the best way to detect these, for example by matching the police route against `auto` costing. At minimum it must say how many restrictions it relies on. The operator chooses; the app never silently routes through a restriction.

Both routes also offer "Open in Google Maps" and "Open in Waze".

## In-app navigation

Turn-by-turn guidance on a map for the chosen route: next manoeuvre, distance to it, road names, ETA from current position, automatic re-routing when off route (keeping the same standard or police choice). Large text, readable at a glance by the operator.

## Pursuit mode

One screen, updating at least once a second:

- **Current speed** (mph) from GPS, large
- **Speed limit** of the current road, as a UK roundel, from OSM `maxspeed` via Valhalla map matching. Show "—" when unknown; never guess.
- **Road** currently on
- **Heading**: compass needle plus cardinal direction (N, NE, …)
- **Current borough**
- **Next junction** being approached, with distance
- **Generally towards**: the next borough or well-known area ahead (e.g. "Tower Hamlets", "Brixton"), worked out by projecting the direction of travel forward around 1–2 km
- **Small live map**, heading-up, showing current position and direction of travel

Works in portrait and landscape, keeps the screen awake.

## Log

Every search and the route picked is saved on the phone (SQLite): time, what was typed, the address chosen, standard or police route. **Never auto-clear.** Officers refer back to it later. Manual "Clear log" with an in-app confirmation.

## Live road closures

The server polls TfL's road disruption feed every 5 minutes and both routes avoid roads TfL lists as fully closed (Valhalla `exclude_polygons`). Closures by the start or destination are left to the officer; if no route avoids them all, the route is found without them and the app says so. Nothing about officers is sent to TfL.

## Team sessions

Opt-in. An officer starts a team and shares its code; members see each other on the maps while the app is open, and can **follow in**: be routed to the nearest point of a colleague's recent track, then along it (map-matched with Valhalla `trace_route`). Follow-in lists restrictions like a blue-light route and refuses a track that goes the wrong way down a one-way street or under a limit the vehicle can't take. Shares are end-to-end encrypted with a key derived from the code; the server keeps only sealed blobs, in memory, for at most a week. Following force policy is the officer's responsibility; the app is upfront about what it does and doesn't do.

## Data handling

Addresses from the control room stay on the phone. The server must not store request logs containing addresses or locations. Use HTTPS throughout. Team-session data is the one thing the server holds, and only end-to-end encrypted, in memory. Usage counts (README, "Usage data") are daily totals only: a random install ID per phone (resettable) and the app version ride on each request, and are kept as salted hashes for 30 days to count unique installs. Never positions, addresses or searches, and no third-party analytics SDK.

## Learning (planned)

Blue Route should learn from real drives: opt-in, anonymised, totals per road only, never raw GPS or addresses. The rules and build steps are in `docs/ROADMAP.md`. Learned speeds feed the map build through `data/learned/practical_speeds.csv`.

## Out of scope for v1

UK-wide coverage, CAD integration, accounts or logins.

## Build order

1. Expo app with a dark map, live GPS position and the tab layout
2. Server with Valhalla (London) and the API; standard and police routes from current position
3. Address search: OS Open Names offline first, then OS Places, with borough filter and saved places
4. In-app turn-by-turn navigation and re-routing
5. Pursuit mode with the mini map
6. Log, polish, and testing on a real phone in a car

## Must pass before calling v1 done

- `Stroud Green Road` appears under Islington
- `Bedminton Estate` finds Bemerton Estate (once OS Places or a saved place covers it)
- `54 Caledonian Road` routes to that door, not the middle of the road
- The police route never goes against a one-way street, tested on known one-way roads
- The police route uses a bus gate or ignores a turn restriction where that is genuinely faster, and lists it
- Journey times are from the phone's current position
- Pursuit mode shows "—" rather than a guess when the speed limit is unknown
- Search and route history survive closing and reopening the app
