# Blue Route server

A small TypeScript API (Fastify) in front of a [Valhalla](https://github.com/valhalla/valhalla) routing engine built from the OpenStreetMap extract for Greater London. The app talks only to the API; API keys and the routing engine stay on the server.

## API

`POST /v1/routes` with `{"from": {"lat", "lng"}, "to": {"lat", "lng"}}` returns:

- `standard`: the fully legal car route (Valhalla `auto` costing)
- `police`: the police route, or `null` with `noPoliceReason` when it isn't offered

Each route has `durationS`, `distanceM`, `shape` (`[lng, lat]` points) and turn-by-turn `maneuvers`. The police route also has `savingS` and `restrictions`, one entry per restricted manoeuvre or bus-only section it relies on, e.g. `{"kind": "turn", "description": "No right turn: Upper Street into Islington Green", "location": {...}}`. If `restrictionsComplete` is false, the list is a lower bound.

`POST /v1/addresses` with `{"query": "Flat 3, 54 Caledonian Road"}` returns `{"addresses": [...]}`: door-level addresses from the OS Places API, each with `uprn`, `label`, `postcode`, `borough` and `lat`/`lng`. Only London addresses are returned; the app sorts them into the officer's boroughs and the rest. Without `OS_PLACES_KEY` this returns 503 `addresses-not-configured` and the app uses its offline road search alone.

`GET /health` returns `{"ok": true}`.

### OS Places

- Get a key from the [OS Data Hub](https://osdatahub.os.uk/) and set `OS_PLACES_KEY` in `.env`. Check the current free allowance and licence terms there before relying on it.
- Boroughs are matched by local custodian code (`src/boroughs.ts`). Confirm the codes against the Data Hub's current list before v1.
- Queries go to OS and the results come back; neither is stored or logged.

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

On a VPS with Docker and at least 4 GB RAM (the tile build needs it; serving needs much less):

```bash
git clone <repo> /opt/blue-route && cd /opt/blue-route/server
cp .env.example .env            # set DOMAIN to a domain pointing at this server
docker compose up -d            # first start downloads London and builds tiles (~15–30 min)
docker compose logs -f api      # Valhalla's own logs are off by design
curl https://$DOMAIN/health
```

Weekly refresh of the map data, with no downtime beyond a restart:

```bash
crontab -e
15 3 * * 0  /opt/blue-route/server/scripts/rebuild-tiles.sh >> /var/log/blue-route-tiles.log 2>&1
```

Settings (environment variables on the `api` service): `VALHALLA_URL`, `OS_PLACES_KEY`, `PORT`, `REGION_BOUNDS` (`west,south,east,north`, London by default), `MIN_SAVING_SECONDS`, `MIN_SAVING_FRACTION`, `RESTRICTION_CHECK_BUDGET`.

Map data © OpenStreetMap contributors, under the Open Database License.
