# Blue Route

Patrol and pursuit navigation for Met Police officers. `CLAUDE.md` is the brief.

- `app/`: the phone app (Expo / React Native, TypeScript). See `app/README.md`.
- `server/`: Valhalla routing for London, the API, the places extractor, and Docker setup for one VPS. See `server/README.md`.
- `DEPLOY.md`: one-off setup; then GitHub rents and sets up the server and builds the Android app.
- `FIELD-TEST.md`: the checklist for testing in a car.

## Usage data

Blue Route counts how much it's used, with no third-party analytics and nothing personal:

- **What the app sends.** Every request to the server carries a random install ID, made on the phone on first launch, and the app version. The ID can be reset on the Session tab. The app also sends three numbers now and then: navigation sessions started, pursuit sessions started, and requests that got no answer within 8 seconds.
- **What the server keeps, per day.**
  - Unique installs per day and per week, and per app version.
  - Routes planned. A search counts once; the quick standard-only request doesn't count again.
  - Navigation sessions and pursuit sessions.
  - Timeouts, failed route plans and server errors.
- **How it keeps the IDs.** Unique installs are counted from salted hashes of the ID, never the ID itself.
  - Each UTC day has its own random salt, and each week (Monday to Sunday) has another.
  - The day hash records no week, and the week hash records no day, so nothing links one install from one day to the next.
  - Within an hour of a day ending, that day's unique total and per-version counts are saved, and its hashes and salt are deleted. The same happens for a week when it ends.
  - At most a week's hashes are ever held. After that, only totals remain.
- **What's never kept.** No positions, addresses, searches, callsigns or IP addresses.

The counts are at `GET /stats` on the server, with the header `Authorization: Bearer <STATS_TOKEN>`. `/stats` is off unless the `STATS_TOKEN` secret is set. Code: `server/src/usage.ts` and `app/src/usage/`.

All six build steps are in: tabs and live map; standard and police routes; address and place search with borough filter and saved places; turn-by-turn navigation with re-routing; pursuit mode; and the search log. It has been tested on a synthetic street network and in a browser, not yet on real London streets.
