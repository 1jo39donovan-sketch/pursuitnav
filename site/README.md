# Website

BlueRoute's public front page: what it is, and where to get it (the App
Store and Google Play). Published by `.github/workflows/web.yml` when the
`WEB_DOMAIN` variable is set (e.g. `bluerouteapp.com`):

- `/`: this front page (`index.html`). `__SERVER_DOMAIN__` becomes the server's address (Privacy and Support links) and `__WEB_DOMAIN__` the site's (the share card, `share.png`); `__STORES__` becomes the store buttons, from the `APP_STORE_URL` and `PLAY_STORE_URL` variables, or "Coming soon" until they're set.
- `/screenshots/`: real captures from the demo, if any are in `site/screenshots/` (named like `1-search.png`; each is captioned "Search · demo"). Shown under the hero; no section when there are none.
- `/privacy`, `/support`: open the server's pages, so there's one copy of each.
- `/app/`: the browser test version of the app. Not linked from the front page, and kept out of search engines (`robots.txt`, `noindex`).
- anything else: sent on to the test app, so old test links (`/search`, `/pursuitnav/…`) still open it.

Without `WEB_DOMAIN`, the test app alone is published at `https://<owner>.github.io/<repo>/`, as before.
