# Deploying BlueRoute

GitHub does the work: one workflow rents and sets up the server, another builds the Android app. You do the parts that need an account, a card or a password, once. About 20 minutes, then waiting.

**Cost:** the Hetzner server, about €6–7 a month including its IP address (check hetzner.com/cloud for the current price). Everything else here is free: DuckDNS for the domain, GitHub for the builds and the download page.

## 1. Merge the code into main

Open the pull request on GitHub and click **Merge pull request**. The workflows run from `main`.

## 2. Hetzner (the server)

Hetzner is a German hosting company. Use only its own websites: **hetzner.com** for sign-up and **console.hetzner.cloud** for managing servers (it may forward you to console.hetzner.com, which is also Hetzner's). Ignore adverts and emails pointing anywhere else.

**Create the account**

1. Go to [hetzner.com/cloud](https://www.hetzner.com/cloud) and click **Sign up** (top right).
2. Enter your email address and a password, then confirm the email Hetzner sends you.
3. Fill in your name and address, and choose **Private customer** (not company).
4. Add a payment method (card or PayPal). Hetzner may also ask for ID, such as a photo of your passport or driving licence. Approval is usually quick, but can take up to a day.

**Create a project**

5. Go to [console.hetzner.cloud](https://console.hetzner.cloud) and log in.
6. Click **+ New project**, name it `BlueRoute`, and click **Add project**.
7. Click the **BlueRoute** project to open it. You don't need to create a server; the workflow does that.

**Make the API token** (it lets GitHub create the server for you)

8. In the project, open **Security** in the left-hand menu, then the **API tokens** tab.
9. Click **Generate API token**.
   - Description: `GitHub deploy`
   - Permissions: **Read & Write**
10. Click **Generate API token** and **copy the token straight away**. Hetzner only shows it once. If you lose it, delete it and make a new one.

**Give the token to GitHub**

11. Open the repository on GitHub and go to **Settings → Secrets and variables → Actions**.
12. On the **Secrets** tab, click **New repository secret**.
    - Name: `HCLOUD_TOKEN`
    - Secret: paste the token.
13. Click **Add secret**.

**What you'll be charged:** about €6–7 a month for the smallest server (CX23) and its IP address, billed monthly by the hour it exists. If the cheapest size is sold out, the workflow picks the next size up, which costs a few euros more; it says which one in its log. To stop paying, delete the server in the console (the project's **Servers** page → the server → **Delete**).

## 3. DuckDNS (a free domain name for HTTPS)

1. Sign in at [duckdns.org](https://www.duckdns.org) (with GitHub or Google).
2. Add a domain, e.g. `blueroute-yourname`. Leave the IP as it is; the workflow sets it.
3. Copy the **token** shown at the top of the page.
4. In GitHub, add:
   - Secret `DUCKDNS_TOKEN`: the token.
   - **Variable** (Variables tab, not Secrets) `SERVER_DOMAIN`: `blueroute-yourname.duckdns.org`.

Using your own domain instead: set `SERVER_DOMAIN` to it, skip `DUCKDNS_TOKEN`, and when the deploy workflow prints the server IP, add an A record pointing at it.

## 4. App signing password

Add secret `ANDROID_KEYSTORE_PASSWORD`: a long random password (a password manager can make one). It protects the key that signs the app, so only your builds can update it on officers' phones. Keep it somewhere safe; if it's lost, phones have to uninstall and reinstall the app, which deletes their log.

## 5. App updates (recommended, free)

A change to the app's own code (screens, search, routing logic) then reaches phones over the air within minutes of being merged, instead of everyone installing a new APK. It uses Expo's EAS Update, which has a free plan; check its monthly limit at [expo.dev/pricing](https://expo.dev/pricing).

1. Sign up at [expo.dev](https://expo.dev) (free) and go to **Account settings → Access tokens → Create token**.
2. In GitHub, add the secret `EXPO_TOKEN` with the token as its value. (The store builds, STORE.md, use the same one.)
3. Run **Actions → Android app → Run workflow** once and install that APK: it's the first one that takes updates.

After that, every change to `app/` merged into `main` runs **App update**: it checks the code, sends it, and its summary says whether phones get it as an update or need the new APK. Phones download it in the background when BlueRoute opens and switch to it the next time it's opened, so nothing changes under an officer mid-job, and with no signal the app carries on as it was. If an update crashes on start, the phone goes back to the version it had.

- **Changes that need a new APK:** anything native, such as a new library or permission. The app's runtime version (a fingerprint of its native code) changes, updates for it don't reach older APKs, and the Android app workflow builds the new APK from the same push.
- **Going back:** run **Actions → App update → Run workflow** with **ref** set to the last good commit (from the commit list on GitHub). Phones switch back the same way.

## 6. Optional

- Secret `OS_NAMES_KEY` (free; address search for postcodes, roads and places): at [osdatahub.os.uk](https://osdatahub.os.uk), sign up on the free OS OpenData plan, create a project (for example "BlueRoute"), add the **OS Names API** to it, switch the project to **live** (development mode is limited to 50 searches a minute), copy the project's key and save it as the secret `OS_NAMES_KEY`. House numbers need no key: the server builds its own search from OpenStreetMap. On a server that already exists, add `OS_NAMES_KEY=...` to `/opt/blue-route/server/.env` and run `docker compose up -d` in that folder.
- Secret `OS_PLACES_KEY` (paid, not needed): OS Places is Premium only, about £0.028 a search, with no free searches. It adds flats and named buildings, and doors OpenStreetMap hasn't mapped (such as 54 Caledonian Road). Leave it empty unless you've decided to pay for it.
- Variable `CONTACT_EMAIL`: shown on the privacy and support pages the app stores link to (STORE.md).
- Secret `STATS_TOKEN` (optional): turns on `GET /stats`, the usage counts (README, "Usage data"). Make a long random string (for example the output of `openssl rand -hex 32`), save it as the secret, and send it as `Authorization: Bearer <token>`. On a server that already exists, add `STATS_TOKEN=...` to `/opt/blue-route/server/.env` and run `docker compose up -d` in that folder.
- Secret `TFL_APP_KEY` (optional): live road closures work without it, but TfL may throttle the server. Free from [api-portal.tfl.gov.uk](https://api-portal.tfl.gov.uk): sign up, then Products → subscribe to the free one, and copy the primary key. On a server that already exists, add `TFL_APP_KEY=...` to `/opt/blue-route/server/.env` instead and run `docker compose up -d` in that folder.
- Secret `SSH_PUBLIC_KEY`: your SSH public key, to log into the server yourself. Without it Hetzner emails you a root password.

## 7. Run it

1. **Actions → Deploy server → Run workflow.** It rents the server, points the domain at it, installs everything and waits until `https://SERVER_DOMAIN` answers, with house-number search: about 10–15 minutes, as it downloads the map and search data GitHub builds each week (if there's no data release yet, run **Actions → Map data** first, about an hour; otherwise the server builds its own in about two hours). Run it once: from then on the server takes each change merged to `main` by itself within about 5 minutes, checks it works, and goes back to the last good version if not (server/README.md, "Updates").
2. **Actions → Android app → Run workflow.** About 20–30 minutes. Then open the **Android app** release page (Code → Releases) on the phone and install `blue-route.apk`.

## 8. Try it on any phone (optional, free)

The web version runs in a phone's browser (Safari on iPhone too) with real GPS, search and routes, connected to your server. It's handy for testing without an Android phone; officers should still use the store apps.

1. In GitHub, go to **Settings → Pages**. Under **Build and deployment**, set **Source** to **GitHub Actions**.
2. Go to **Actions → Web app → Run workflow**. It takes about 5 minutes.
3. Open `https://<your GitHub username>.github.io/pursuitnav/` on the phone and allow location when asked.

## After that, it looks after itself

- Map and places refresh from OpenStreetMap every Sunday night.
- The server picks up new code from `main` within about 5 minutes (server/README.md, "Updates").
- Every change to the app on `main` builds a new APK on the same release page; install it over the old one and the log is kept. With `EXPO_TOKEN` set (section 5), phones also get the change over the air without installing anything.
- Dependabot opens pull requests on Mondays when a library BlueRoute uses has a new version (`.github/dependabot.yml`). Merge them once CI is green; the Expo SDK, Valhalla and Nominatim are upgraded by hand.

Changing the OS key later: update the secret, then run **Deploy server** with **recreate** ticked. Nothing officers rely on is stored on the server, so a fresh one is safe.

Moving the server to your own domain (e.g. from DuckDNS to `api.example.org` on Cloudflare):

1. In Cloudflare, make an API token limited to **Zone → DNS → Edit** on that zone, and save it as the secret `CLOUDFLARE_API_TOKEN`. Then the deploy points the name at each new server by itself (DNS only, never proxied: positions mustn't pass through Cloudflare). Without it, add the A record by hand when the run asks.
2. Set the variable `SERVER_DOMAIN` to the new name, and `SERVER_ALSO_SERVE` to the old one, so phones still on the old address keep working.
3. Run **Deploy server** with **recreate** ticked (a few minutes without the server). Then run **Web app** (and **Android app**) so new builds use the new name.
4. Once every phone has the new build, empty `SERVER_ALSO_SERVE` and recreate again to drop the old name.

A website on your own domain (a public front page at `/` with App Store and Google Play buttons; the browser test version unlisted at `/app/`): set the variable `WEB_DOMAIN` (e.g. `bluerouteapp.com`), point the domain at GitHub Pages (A records `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`, and AAAA `2606:50c0:8000::153`, `8001::153`, `8002::153`, `8003::153`, DNS only; `www` as a CNAME to `<owner>.github.io`), enter it under Settings → Pages → Custom domain with Enforce HTTPS, and run **Web app**. Once the store listings are live, set `APP_STORE_URL` and `PLAY_STORE_URL` and run it again. See site/README.md.

Putting the app on the App Store and Google Play: see STORE.md.
