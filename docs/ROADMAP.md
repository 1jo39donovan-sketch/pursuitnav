# Blue Route roadmap: learning from drives, and beyond London

The key aim: get the officer or crew from A to B quickly and safely. Both pieces below serve that aim. Learning makes journey times and route choices match real blue-light driving. Expansion takes Blue Route to wherever crews drive.

## Where things stand (October 2026)

- **Routes favour main roads.** The map build gives every road a realistic travel speed by road type (`server/places/practical_speeds.py`). Main roads are timed near their limit. Side streets are timed slower because of parked cars, humps and tight junctions. A bus lane counts in a road's favour.
- **These are starting estimates, not measurements.** Learning replaces them road by road.
- **Routes are sized to the vehicle,** from car to fire appliance, and never use a bridge or weight limit it can't take.
- **The region is a setting.** The server builds whatever OpenStreetMap extract `PBF_URL` names, and `REGION_BOUNDS` sets the covered area. The app keeps its area settings in one place (`app/src/config.ts`).

## 1. Learning from drives (opt-in, anonymised)

### What it learns

- How fast each road is actually driven on blue lights, at different times of day.
- Which junctions and roads crews avoid, and which shortcuts they take.
- Over time, which route crews really choose between two points, compared with what Blue Route suggested.

### Privacy rules (non-negotiable)

1. **Off by default.** A crew member turns it on in Session, after a plain-English explanation. They can turn it off at any time, and that also deletes anything not yet sent.
2. **No raw GPS ever leaves the phone.** The phone matches each drive to the road network itself and keeps only "road X took Y seconds". Positions, times of day to the second, and the drive as a line are never sent.
3. **The ends are cut off.** The first and last 500 m of every drive are dropped, so stations, homes and incident addresses can't be inferred.
4. **No identity.** No account, device ID or callsign is sent with the data. Uploads are batched, delayed until hours after the shift, and shuffled, so a batch can't be tied to a person or an incident.
5. **The server keeps only totals per road.** For each road and time band it keeps a count and a median speed. Each batch is discarded once it has been added in. A road's learned speed is only used once at least 5 separate drives have covered it.
6. **Never addresses.** Search terms, destinations and the log stay on the phone, as now.

### How it feeds back

Each week the server turns its per-road totals into `data/learned/practical_speeds.csv` (`way_id,mph`). The map build already reads that file, so learned speeds replace the starting estimates on those roads and routes adjust by themselves.

### Before switching it on

- **A data protection impact assessment and an updated privacy policy**, plus updated privacy answers for Apple and Google. This data reveals how emergency vehicles move, even when it's anonymous and totalled per road.
- **Ideally, agreement from the forces and services whose crews use it.**
- **About £0 extra running cost:** the totals are small and fit on the current server.

### Built (October 2026)

1. **Phone:** during navigation it times each road of the route while on it. The server sends each route's OpenStreetMap way IDs with it, so the phone never has to send GPS to match the drive (`app/src/learning/timing.ts`). Demo drives are never timed.
2. **Phone:** the opt-in switch on Session with its explanation. Times wait on the phone at least 6 hours, until 30 or more can go together, shuffled (`app/src/learning/queue.ts`). Turning it off deletes the queue.
3. **Server:** `POST /v1/learn` adds each batch to per-road histograms (by time band) and discards it; no request logging (`server/src/learning.ts`). Uploads carry no identity, so "5 separate drives" is counted as 5 timings of the road.
4. **Server:** every 10 minutes the API writes `data/learned/practical_speeds.csv` (median per road, roads with 5+ timings), which the weekly map build reads.

### Switching it on

It stays off on the server, and the app hides the switch, until `LEARNING=1` is in `/opt/blue-route/server/.env` (then run `docker compose up -d` in `/opt/blue-route/server`). Do the steps under "Before switching it on" first, and update the App Store and Play privacy answers to say the app collects anonymised "product interaction" data (not linked to the user) only when the user opts in.

## 2. Beyond London: UK-wide, then Ireland

### What changes

| Part | London now | UK / Ireland |
|---|---|---|
| Routing map | Greater London extract, about 100 MB | Great Britain about 1.9 GB; Ireland and Northern Ireland about 300 MB. Both go in one Valhalla map. |
| Server | CX23 (4 GB RAM), about €6/month | Building GB tiles needs about 16 GB RAM for an hour a week. GitHub's free build machines can do the weekly build and ship the result. Serving needs about 8 GB RAM: roughly €15–20/month. |
| Address search | OS Places (door level), OS Open Names (offline roads) | OS covers Great Britain only. Northern Ireland needs OSNI/Pointer data; Ireland needs Eircode/GeoDirectory, which are paid. Elsewhere, roads and places from OpenStreetMap still work. |
| Areas | 32 boroughs plus the City of London, as chips | Local authorities (about 360 in GB, 11 in NI, 31 in Ireland), chosen by search or "near me" instead of chips. |
| Offline data | London roads bundled in the app | Downloaded per area on first use and kept, so the app stays small. |
| Places | London extract | The same code on the bigger extract, split per area for download. |

### Order of work

1. **Regions as data.** The server publishes its regions (name, bounds, areas and data files) and the app downloads them instead of bundling London. This is the main code change; everything else is data.
2. **England, then GB.** Bigger extract, weekly build on GitHub, server upgrade, local-authority areas, per-area offline data.
3. **Northern Ireland and Ireland.** Add the extract and areas. Check the address data licences (OSNI, Eircode). Until those are in place, road and place search come from OpenStreetMap.

### Kept the same

- The privacy rules.
- Vehicle sizing.
- One-way protection.
- Listing every restriction a blue-light route uses.
- Showing "—" for unknown speed limits.

None of these depend on the region.
