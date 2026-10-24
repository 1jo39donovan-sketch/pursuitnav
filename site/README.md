# Website

The front page at the site's root, published with the web app by
`.github/workflows/web.yml`. With the `WEB_DOMAIN` variable set (e.g.
`bluerouteapp.com`), the site is:

- `/`: this front page (`index.html`; `__SERVER_DOMAIN__` becomes the server's address for the Privacy and Support links)
- `/app/`: the web app
- anything else: sent on to the app, so old links (`/search`, `/pursuitnav/…`) still open it

Without `WEB_DOMAIN`, the web app alone is published at `https://<owner>.github.io/<repo>/`, as before.
