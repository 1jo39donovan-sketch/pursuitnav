# Deploying Blue Route

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
6. Click **+ New project**, name it `Blue Route`, and click **Add project**.
7. Click the **Blue Route** project to open it. You don't need to create a server; the workflow does that.

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
