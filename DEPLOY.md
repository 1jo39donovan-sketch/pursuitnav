# Deploying Blue Route

GitHub does the work: one workflow rents and sets up the server, another builds the Android app. You do the parts that need an account, a card or a password, once. About 20 minutes, then waiting.

**Cost:** the Hetzner server, about €6–7 a month including its IP address (check hetzner.com/cloud for the current price). Everything else here is free: DuckDNS for the domain, GitHub for the builds and the download page.

## 1. Merge the code into main

Open the pull request on GitHub and click **Merge pull request**. The workflows run from `main`.

## 2. Hetzner (the server)

1. Sign up at [hetzner.com/cloud](https://www.hetzner.com/cloud) and add a payment method (they may ask for ID).
2. In the Cloud Console, create a project called **Blue Route**.
3. In the project: **Security → API tokens → Generate API token**, permission **Read & Write**. Copy it.
4. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - Name `HCLOUD_TOKEN`, value: the token.

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

## 5. Optional

- Secret `OS_PLACES_KEY`: door-level addresses (needed for "54 Caledonian Road" to route to the door). From [osdatahub.os.uk](https://osdatahub.os.uk): create a project with the OS Places API. Check the free allowance and licence terms there.
- Variable `CONTACT_EMAIL`: shown on the privacy and support pages the app stores link to (STORE.md).
- Secret `SSH_PUBLIC_KEY`: your SSH public key, to log into the server yourself. Without it Hetzner emails you a root password.

## 6. Run it

1. **Actions → Deploy server → Run workflow.** It rents the server, points the domain at it, installs everything and waits until `https://SERVER_DOMAIN` answers: usually 20–40 minutes.
2. **Actions → Android app → Run workflow.** About 20–30 minutes. Then open the **Android app** release page (Code → Releases) on the phone and install `blue-route.apk`.

## After that, it looks after itself

- Map and places refresh from OpenStreetMap every Sunday night.
- The server picks up new code from `main` each night.
- Every change to the app on `main` builds a new APK on the same release page; install it over the old one and the log is kept.

Changing the OS key later: update the secret, then run **Deploy server** with **recreate** ticked. Nothing officers rely on is stored on the server, so a fresh one is safe.

Putting the app on the App Store and Google Play: see STORE.md.
