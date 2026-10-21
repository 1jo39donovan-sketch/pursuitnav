# Blue Route server

A small TypeScript API (Fastify) in front of a [Valhalla](https://github.com/valhalla/valhalla) routing engine built from the OpenStreetMap extract for Greater London. The app talks only to the API; API keys and the routing engine stay on the server.

## API

`POST /v1/routes` with `{"from": {"lat", "lng"}, "to": {"lat", "lng"}}` returns:

- `standard`: the fully legal car route (Valhalla `auto` costing)
- `police`: the police route, or `null` with `noPoliceReason` when it isn't offered

Each route has `durationS`, `distanceM`, `shape` (`[lng, lat]` points) and turn-by-turn `maneuvers`. The police route also has `savingS` and `restrictions`, one entry per restricted manoeuvre or bus-only section it relies on, e.g. `{"kind": "turn", "description": "No right turn: Upper Street into Islington Green", "location": {...}}`. If `restrictionsComplete` is false, the list is a lower bound.

`POST /v1/follow` with `{"from": {...}, "track": [[lng, lat], ...]}` returns `{"route", "joinedAtM"}`: a colleague's way in, from here (team sessions). The route lists restrictions like a blue-light route; a track that goes the wrong way down a one-way street is refused (422 `follow-refused`).

`PUT /v1/teams/:teamId/members/:memberId` `{token, blob}`, `GET /v1/teams/:teamId`, `DELETE …/members/:memberId` `{token}`: team sessions. Blobs are sealed on the phones; the server keeps them in memory only, for at most a week.

Both route responses avoid roads TfL lists as fully closed (`src/closures.ts`) and say so in `closures: {active, updatedAt, ignored}`.

`POST /v1/addresses` with `{"query": "Flat 3, 53 Caledonian Road"}` returns `{"addresses": [...]}`, each with `id`, `source`, `precision`, `label`, `postcode` (may be empty), `borough` and `lat`/`lng` (and `uprn` from OS Places). Free by default; see "Address search" below. Only London addresses are returned, and every `borough` is one of the app's borough names; the app sorts them into the officer's boroughs and the rest. With no provider set up it returns 503 `addresses-not-configured`, and 503 `addresses-unavailable` only if every provider failed; either way the app falls back to its offline road search.

`GET /v1/places-data` returns every named place in London (shops, cafés, schools, parks, blocks, estates…) as a gzipped text file for the app to keep offline. It has an ETag, so the app only downloads it when it changes. It's public OpenStreetMap data and the request carries nothing about the officer.

`GET /health` returns, for example:

```json
{"ok": true, "routing": true, "places": true,
 "addresses": {"osNames": true, "nominatim": true, "osPlaces": false},
 "learning": false, "closures": 18}
```

`routing` and `places`: the map data is built. `addresses`: which address providers the server has; `nominatim` is true once its database is built and answering.

### Places

**Map build.** `scripts/build-map.sh` downloads the OSM extract named by `PBF_URL` in `.env` (Greater London by default), adds travel speeds with `places/practical_speeds.py`, builds Valhalla's tiles and swaps them in. Travel speeds go in `maxspeed:practical`, which Valhalla uses for timing while `maxspeed` stays the signed limit: main roads are timed near their limit, side streets slower, so routes favour main roads as blue-light drives do. Learned speeds in `data/learned/practical_speeds.csv` (`way_id,mph`) override the model road by road. Cron runs it weekly as `rebuild-tiles.sh`.

`places/extract_places.py` reads the London OSM extract and writes `data/places/places.txt.gz`: one line per named place with its type ("Coffee shop", "Corner shop", "School"…), group, borough (point-in-polygon against `places/london-boroughs.geojson`), a point inside it and its address where OSM has one. `places/categories.py` decides what counts as a place and what to call it. `scripts/build-places.sh` runs it in Docker; `build-map.sh` runs it after each map build. Tests: `pytest places` (needs `pip install -r places/requirements.txt`).

### Address search

`src/addressSearch.ts` asks every provider the server has, in parallel, and merges the answers: `door` first, then `postcode`, `road` and `place`; the same address or road from two providers within 30 m shown once (OS Places preferred, then OpenStreetMap, then OS Names); at most 30. One provider failing doesn't fail the search. A full postcode goes to OS first, and to OpenStreetMap only if OS has nothing.

| Provider | Key | What it gives | Precision |
|---|---|---|---|
| **OS Names** (`src/osNames.ts`) | `OS_NAMES_KEY`, free (OS OpenData plan) | postcodes, roads, areas, stations, hospitals… | `postcode`, `road`, `place` |
| **Nominatim**, our own (`src/nominatim.ts`) | none: `NOMINATIM_URL`, set by `build-geocoder.sh` | house numbers OpenStreetMap has mapped, streets | `door` (a mapped house with the number and street asked for), `road` (an interpolated number or the street), `postcode`, `place` |
| **OS Places** (`src/places.ts`), optional | `OS_PLACES_KEY`, **paid** | every address, down to flats and named buildings | `door` |

- **OS Names** is free for any use under the Open Government Licence, but needs a key from an OS Data Hub project on the OS OpenData plan, with the project switched to **live** (600 requests a minute; 50 in development mode). Results come in British National Grid; `src/bng.ts` converts them (inverse Transverse Mercator and OS's 7-parameter Helmert, a few metres at most). The borough comes from OS's `DISTRICT_BOROUGH`/`COUNTY_UNITARY` when it's one of ours, else from `places/london-boroughs.geojson`; anything outside London is dropped. It can't find house numbers ("21 Croxton Road").
- **Nominatim** (`mediagis/nominatim:5.3`, amd64 and arm64) imports the same London extract as the routing map. `scripts/build-geocoder.sh` imports it into a fresh database after the weekly map build (never at the same time: both need most of the memory), checks it finds a known street, then switches the live service over and deletes the old copy. Settings are in `nominatim.env` (`IMPORT_STYLE=address`, `FREEZE=true`, GB postcodes, Postgres tuned down for 4 GB). It's on the internal network only, with logging off. Coverage is OpenStreetMap's: about 623,000 London objects carry a house number, far fewer than London's addresses, so many numbers come back as the road (the app then warns it isn't the door). 54 Caledonian Road, for example, isn't mapped.
- **OS Places** is Premium only, about £0.028 a search, with no free searches. Used only if `OS_PLACES_KEY` is set, alongside the free providers, for flats and named buildings. Boroughs are matched by local custodian code (`src/boroughs.ts`). Its answers are never cached, as its licence on keeping results isn't clear for this use.
- **Cache:** answers from OS Names and Nominatim are kept **in memory only**, for 24 hours (empty answers for 10 minutes), up to 5,000 queries, keyed by the query in lower case with spaces tidied. A repeat search makes no outbound call. Errors and incomplete answers aren't kept. Nothing about searches is written to disk or logged.

**Nominatim on the server** (measured on a Hetzner CX23, 2 vCPU, 4 GB RAM + 4 GB swap, during the deploy of this change):

- First deploy (21 Oct 2026, from an empty server): the routing map, places and the Nominatim import were all done 128 minutes after the server was created; the London smoke test then passed with no OS Places key.
- Import (London, `IMPORT_STYLE=address`, 21 Oct 2026, on GitHub's 4-core build machine): 33 minutes; the import peaked at 1,336 MiB and the whole machine at 2,375 MiB with no swap, so it fits a 4 GB CX23. The database is 3.6 GB on disk (853 MB compressed). On the CX23 itself, early in an import: 528 MiB for the import, 1,012 MiB used on the whole server, no swap.
- Memory while serving, with Valhalla and the API: reported by `GET /stats` (`server`) once servers run the code that adds it; the serving container is capped at 1 GB (`mem_limit`), and served in 171 MiB on an Islington-sized test.

### How the police route works

- Valhalla `bus` costing, so bus lanes, bus-only roads and bus gates are usable, with `ignore_restrictions: true` (turn restrictions ignored) and `ignore_oneways: false`.
- **One-way streets:** bus costing still allows contraflow bus lanes. After routing, every stretch the route uses is checked, and any that drives against the flow of a one-way street is excluded and the route recalculated. If that can't be avoided, no police route is offered.
- **Finding the restrictions:** for stretches of the police route, a legal car route is requested between the same two points. If the car has to detour, the stretch is split in half and each half re-checked, down to a single road (bus-only) or a pair of roads (a banned turn). See `src/restrictions.ts`.
- **Only when worth it:** offered only if it saves at least 30 s and 5% (`MIN_SAVING_SECONDS`, `MIN_SAVING_FRACTION`), and only if the restrictions it relies on were found.
- **Known gap:** Valhalla's `ignore_restrictions` also turns off height, width and weight limits, so the car dimensions set in `src/costing.ts` have no effect.

## Privacy

Requests contain officers' positions and control-room addresses. Nothing is stored:

- The API logs no requests and no request bodies, only failures without payloads.
- Valhalla's logs are switched off in `docker-compose.yml` (it logs slow requests in full).
- Caddy access logging is off.
- Nominatim's logs are switched off too (its requests are addresses), and address answers are cached in memory only.

## Development

Needs Node 22, and Python with `pyvalhalla` and `osmium` for the integration tests:

```bash
pip install pyvalhalla==3.9.1 osmium
npm install
npm run typecheck
npm test          # unit tests, plus integration tests against a real Valhalla
```

The integration tests build a small synthetic street network (`test/fixtures/make_fixture.py`) with a one-way street, a one-way street with a contraflow bus lane, a bus gate, a banned right turn and a plain grid. They run a real Valhalla on it and check the API end to end, including that neither route ever goes the wrong way down a one-way street. Set `VALHALLA_PYTHON` if `python3` isn't the one with those packages.

To run against a local Valhalla: `VALHALLA_URL=http://localhost:8002 npm run dev`.

## Deploying (one small VPS)

Quickest: on a fresh Ubuntu 22.04/24.04 VPS with the domain already pointing at it, as root:

```bash
curl -fsSL https://raw.githubusercontent.com/1jo39donovan-sketch/pursuitnav/main/server/scripts/install.sh | bash
```

`scripts/install.sh` does everything below (Docker, firewall, swap for the build, code, `.env`, start, places, weekly cron, HTTPS check) and is safe to re-run to update. By hand:

On a VPS with Docker and at least 4 GB RAM (the tile build needs it; serving needs much less):

```bash
git clone <repo> /opt/blue-route && cd /opt/blue-route/server
cp .env.example .env            # set DOMAIN to a domain pointing at this server
docker compose up -d            # first start downloads London and builds tiles (~15–30 min)
scripts/build-places.sh         # once the tiles are built: extract shops, cafés, schools, parks…
docker compose logs -f api      # Valhalla's own logs are off by design
curl https://$DOMAIN/health
```

London smoke test against a live server (the deploy runs it last): one-way streets, a bus gate, and address search with no OS Places key (a door OpenStreetMap has mapped on Caledonian Road, `N7 8LA` as a postcode, and `54 Caledonian Road` as the road in Islington, or as the door when OS Places is on):

```bash
server/scripts/smoke-london.sh https://$DOMAIN                     # everything
server/scripts/smoke-london.sh https://$DOMAIN --skip-address      # a test server with no address search
server/scripts/smoke-london.sh https://$DOMAIN --address "10 Downing Street" --borough Westminster
```

## Updates

The server keeps itself up to date (`scripts/cron.sh` writes its schedule; install and every update re-apply it):

- **Code, every 5 minutes** (`scripts/update.sh`): with nothing new on `main` it stops in a second. With a new commit it takes it, rebuilds the API, restarts, and runs `scripts/check-server.sh` (health, a London route, address search). If the checks fail it goes back to the version it was running, writes the failed commit to `data/update-failed` and doesn't try that commit again; the next commit on `main` gets its own try. Log: `/var/log/blue-route-update.log`. A merge is live about 5 minutes later; `GET /health` shows the `version` (commit) running.
- **Map, places and house-number search, Sundays 03:15** (`scripts/rebuild-tiles.sh`): built beside the live data and swapped in, no downtime beyond a restart. Code updates wait while it swaps the map in.
- **Operating system security fixes, daily** (unattended-upgrades).

The live server runs only `main`. The deploy workflow's `branch` input is for a separate test server.

**Uptime check** (`.github/workflows/uptime.yml`): every 10 minutes GitHub runs `check-server.sh` against the live server; a failure fails the run and GitHub emails about it.

**Compatibility:** `test/unit/contract.test.ts` pins what app versions already on phones read from the server. Phones don't all update at once, so CI fails a server change that would break them.

```bash
server/scripts/check-server.sh https://$DOMAIN            # the same checks, by hand
```

Settings (environment variables on the `api` service): `VALHALLA_URL`, `OS_NAMES_KEY` (free, address search), `NOMINATIM_URL` (set by `build-geocoder.sh`), `OS_PLACES_KEY` (paid, optional), `PORT`, `REGION_BOUNDS` (`west,south,east,north`, London by default), `MIN_SAVING_SECONDS`, `MIN_SAVING_FRACTION`, `RESTRICTION_CHECK_BUDGET`, `TFL_APP_KEY` (optional key for the TfL closures feed), `TFL_CLOSURES` (`0` turns live closures off).

Map data © OpenStreetMap contributors, under the Open Database License.
