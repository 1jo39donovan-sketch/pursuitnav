# BlueRoute v1 checklist

Every requirement in CLAUDE.md, how it's met, and what's still open. Checked 25 October 2026 against `main` and the live server.

**Key:** ✅ met and tested · 🟡 met, with a limit or still to confirm · ⏳ waiting on something outside the code · ❌ not done

## Summary

All 8 "must pass" items are met in the code, and 7 have automated tests. The **in-car test on a real phone** is the one v1 step that hasn't happened; nothing else stops sign-off.

| | |
|---|---|
| Must-pass items | 6 ✅, 2 🟡 (54 Caledonian Road is an estimated door without OS Places; the log surviving a restart is still to confirm on a phone) |
| Spec areas | 14 ✅, 3 🟡, 1 ⏳ (entrances, waiting on the weekly build), 0 ❌ |
| Still to do before calling v1 done | the real drive (build order step 6) |
| Decisions for Josh | OS Places key (paid), store accounts, turning learning on |
| Automated tests | app 214, server 200, Python 25+, plus the live London smoke test after every deploy |

## Must pass before calling v1 done

| # | Requirement | Status | How it's met | Evidence |
|---|---|---|---|---|
| 1 | `Stroud Green Road` appears under Islington | ✅ | Offline OS Open Names, assigned to boroughs by boundary; roads just over the line count as in the area | `app/src/search/__tests__/search.test.ts` ("finds Stroud Green Road under Islington", also `stroud green rd`) |
| 2 | `Bedminton Estate` finds Bemerton Estate | ✅ | Bemerton Estate is in the built-in estates list (on Caledonian Road), and search forgives misspellings. Officers' saved places work the same way | `search.test.ts` ("finds Bemerton Estate from 'Bedminton Estate'") |
| 3 | `54 Caledonian Road` routes to that door, not the middle of the road | 🟡 | With an OS Places key: OS's exact door. Without one (as now), OpenStreetMap doesn't have number 54, so the server **estimates** the door from mapped neighbours (52, 56…, same side, within 250 m) and the result says "(estimated)" | `server/test/unit/nominatim.test.ts`; live smoke test `check_address` after every deploy. **Decision:** accept the estimate for v1, or add OS Places (paid) |
| 4 | The police route never goes against a one-way street | ✅ | Valhalla `bus` costing with `ignore_oneways: false`; every route is checked | `server/test/integration/routes.test.ts` ("one-way streets", including a contraflow bus lane); live smoke test `check_one_ways` on real London one-ways |
| 5 | The police route uses a bus gate or ignores a turn restriction where genuinely faster, and lists it | ✅ | Matched against the `auto` route; each restriction listed with its place, merged when repeated, and marked on the map | `routes.test.ts` ("bus gates", also with a van); live smoke test `check_bus_gate` |
| 6 | Journey times are from the phone's current position | ✅ | Every route starts at the latest GPS fix; the ETA counts down from where the phone is | `app/src/api/__tests__/routes.test.ts`; PM QA rounds 2–4 |
| 7 | Pursuit shows "—" rather than a guess when the limit is unknown | ✅ | Speed limit only from OSM `maxspeed` via map matching | `server/test/integration/pursuit.test.ts` ("shows no speed limit for a road without one") |
| 8 | Search and route history survive closing and reopening | ✅ / 🟡 | SQLite on the phone (browser storage on the web app); never auto-cleared; "Clear log" asks first | PM checked on the web app. **Confirm on the phone** during the drive |

## The spec, area by area

| Area | Status | Notes |
|---|---|---|
| **Look**: dark navy, amber, Inter, full-screen maps with floating controls, Session / Search / Pursuit tabs, log from Session | ✅ | Redesign done; day and night maps, larger text setting |
| **Session**: callsign and boroughs (32 + City) persist, filter search | ✅ | Also BCU codes and London area groups; vehicle profile; blue-light switch (on by default) |
| **Address search**: road, house number, flat, postcode alone or at the end, outward code, estate or block, misspellings, nicknames | ✅ / 🟡 | All formats parse and find results. **Flat-level** answers (`Flat 3, 54 Caledonian Rd`) need OS Places; without it, they go to the building or road and say how exact they are |
| **Data sources**: OS Names (free), our Nominatim house numbers, OS Places (optional, paid), Open Names offline, saved places | 🟡 | All built. OS Places isn't switched on (no key: paid, Premium only) |
| **Places**: any named OSM place, by name or kind, offline, in-area first, "Show N outside your area" | ✅ | Weekly from the Geofabrik file; nearest A&E in one tap, with non-A&E sites filtered out |
| **Routing**: two routes from GPS; standard `auto`; police `bus` with `ignore_restrictions`, vehicle sizes | ✅ | Bridge height, width and weight checked on every route and re-routed; tests prove it |
| **Main roads**: practical speeds per road type | ✅ | `maxspeed:practical` in the map build; "prefer main roads" setting |
| **Blue light offered only when meaningfully faster**, time saved, each restriction with location, operator chooses | ✅ | Never silently; standard route always offered |
| **Open in Google Maps / Waze** | ✅ | On both routes and in navigation |
| **Turn-by-turn**: next manoeuvre, distance, road names, ETA, re-routing keeping the choice, large text, spoken | ✅ | Plus arrival side and house number, coming-up list in landscape, works without signal along the last route |
| **Pursuit**: speed, limit roundel, road, heading, borough, next junction, generally towards, heading-up mini map, ≥1 s, portrait and landscape, screen awake | ✅ | Plus nearest house number |
| **Log**: time, typed text, address chosen, route type; never auto-clear; manual clear with confirmation | ✅ | |
| **Live road closures**: TfL every 5 min, closed roads avoided, Serious/Severe holdups routed round when cheap | ✅ | `closures.test.ts`, `delays.test.ts` |
| **Team sessions**: opt-in, code, end-to-end encrypted, in memory, a week at most, follow-in with restrictions and one-way refusal | ✅ | `teams.test.ts`; needs two phones on the drive to try for real |
| **Offline map**: weekly PMTiles, Wi-Fi only unless allowed, used with no signal | ✅ | |
| **Building entrances** (route to the door of a block) | ⏳ | Built; the entrances file arrives with the next weekly data build (around 31 October). A&E entrance labels arrive with it |
| **Data handling**: no request logs with addresses or positions, HTTPS, daily usage totals with salted hashes, OTA updates only | ✅ | `usage.test.ts`, privacy policy updated 25 October |
| **Learning** (planned) | 🟡 | Built and tested, **switched off** on the server until you decide to turn it on (the store privacy answers change when you do: see STORE.md) |

## Build order

| Step | Status |
|---|---|
| 1. Expo app, dark map, GPS, tabs | ✅ |
| 2. Server with Valhalla and the API, both routes from current position | ✅ live at api.bluerouteapp.com, self-updating from tested `main` |
| 3. Address search: Open Names offline, OS Places, borough filter, saved places | ✅ (OS Places optional, not switched on) |
| 4. Turn-by-turn and re-routing | ✅ |
| 5. Pursuit mode with mini map | ✅ |
| 6. Log, polish, and **testing on a real phone in a car** | 🟡 Log and polish done; four PM QA rounds on the web app. **The in-car test is still to do** |

## Still to do for v1

1. **Drive it.** Install the Android test build (or TestFlight once Apple is set up) and do a real drive with an operator. Check during the drive:
   - GPS, voice and re-routing in traffic; the screen stays awake
   - Pursuit updates every second; the speed limit roundel and "—"
   - the log is still there after closing the app fully and opening it again (must-pass 8)
   - no signal: navigation carries on along the route (download the offline map on Wi-Fi first)
   - a team session between two phones, and follow-in
   - Field-test recording on, so any problem can be replayed afterwards
2. **After the weekly build (~31 October):** check routes to a block of flats end at an entrance, and the nearest A&E shows "(A&E entrance)". Claude checks this then.

## Decisions for Josh

- **54 Caledonian Road / flats:** accept the estimated door for v1, or pay for OS Places (Premium) for exact doors and flats.
- **Store accounts:** Apple (£79 a year) and Google ($25 once). The listing and privacy answers are ready in STORE.md.
- **Learning:** leave off for v1, or turn on (update the store privacy answers first).
- **Solicitor review** of the terms and privacy policy, if you want one before the public listing.

## Known small items

- Day/Night button "sticky": closed. The PM re-tested on 26 October with a recording: one tap per change, no lag, no snap-back. The button shows the mode you'll switch *to*.
- Small Android phones (360 × 720): times on the route cards were cut off, the turn card took half the screen and END didn't work on a page opened from its address. Fixed 26 October.
- Landscape turn list clipped on a phone (PM, round 4): to check on the drive.
- Street-level live traffic (TomTom or HERE): a later decision, as CLAUDE.md says.
