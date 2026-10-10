# Blue Route

Patrol and pursuit navigation for Met Police officers. `CLAUDE.md` is the brief.

- `app/`: the phone app (Expo / React Native, TypeScript). See `app/README.md`.
- `server/`: Valhalla routing for London, the API, the places extractor, and Docker setup for one VPS. See `server/README.md`.
- `DEPLOY.md`: one-off setup; then GitHub rents and sets up the server and builds the Android app.
- `FIELD-TEST.md`: the checklist for testing in a car.

All six build steps are in: tabs and live map; standard and police routes; address and place search with borough filter and saved places; turn-by-turn navigation with re-routing; pursuit mode; and the search log. It has been tested on a synthetic street network and in a browser, not yet on real London streets.
