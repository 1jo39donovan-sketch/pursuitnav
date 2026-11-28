# BlueRoute: IT, security and data protection summary

For a force's IT security team, data protection officer (DPO) or information management team, when asked to allow BlueRoute on force phones or to evaluate it. Written from the code on 28 November 2026. Everything here is what the app and server do now, not plans, unless it says otherwise. The public privacy policy is at https://api.bluerouteapp.com/privacy.

**Maker:** OPSVALE LTD, company 17605107, 128 City Road, London EC1V 2NX. Contact: support@bluerouteapp.com.

## At a glance

| | |
|---|---|
| What it is | Navigation for police, ambulance and fire crews: address search the way control gives it, a standard route and a blue-light route side by side, turn-by-turn, a pursuit commentary screen, optional team sessions |
| Accounts | None. No sign-in, no user database |
| Analytics | No third-party analytics or advertising SDKs. Anonymous daily counts only (see "Usage counts") |
| Where data lives | Searches, the log, settings and saved spots stay on the phone. The server keeps no positions, addresses or request logs |
| Server | One virtual server at Hetzner (EU: Germany or Finland), run by OPSVALE LTD. HTTPS only |
| Team sessions | Opt-in. End-to-end encrypted (XChaCha20-Poly1305) with a key from the team code. The server holds only sealed data, in memory |
| Background location | None. Location is used only while the app is open. On Android, a foreground service ("BlueRoute: directions on") keeps GPS and voice running while navigating or in Pursuit, and stops with them |
| Platforms | Android app (`com.blueroute.patrol`: a test APK now, Google Play once OPSVALE's developer account exists); iPhone app (same ID: built and checked weekly, App Store once the Apple account exists); web app at https://bluerouteapp.com/app for desks |
| Certifications | **None yet.** Cyber Essentials is planned (see "Not in place yet") |

## Permissions the app asks for

| Permission | Why | When |
|---|---|---|
| Location while in use (precise) | Routes start from where the crew is; Pursuit shows the road, speed and limit | Asked after the crew accepts the terms on first launch |
| Android foreground service (location) | Keeps directions and voice going with the screen locked, during navigation and Pursuit only | Shown as a notification while running |

It does **not** ask for background ("all the time") location, contacts, camera, microphone, photos, calendar or notifications for marketing.

## What leaves the phone, and where it goes

| Data | Goes to | Kept? |
|---|---|---|
| Current position and destination, to plan a route | BlueRoute server | No. Answered in memory |
| Typed address search | BlueRoute server; the server passes it to Ordnance Survey's OS Names API (the phone never contacts OS) | Search and answer held in server memory up to 24 hours for speed, with no ID, IP address or position; never written to disk or logged |
| Recent positions in Pursuit, to find the road and limit | BlueRoute server | No |
| "Where am I" point, to find the address | BlueRoute server | No |
| Which part of the map is on screen (map tiles) | OpenFreeMap (tiles.openfreemap.org), a free public map service, directly from the phone. It sees the phone's IP address | Not by us; OpenFreeMap's own terms apply |
| Satellite or OS map tiles, if chosen | BlueRoute server, which fetches them from Esri or Ordnance Survey itself | No |
| Random install ID and app version, on each request | BlueRoute server | Only as salted hashes, for daily and weekly unique counts; the salts are deleted when the day or week ends. Can be reset or switched off (Session → Privacy and data) |
| Team position and messages (opt-in) | Other team members, through the server | Sealed (unreadable to the server), in memory: messages up to 12 hours, a member's entry until they leave or a day after they stop sharing, the team a week at most |
| App update check | Expo's update service (u.expo.dev) | Sends the app's runtime version, platform and a random update ID; Expo sees the IP address like any website |
| Journey-time learning | BlueRoute server | **Off** (needs the crew to turn it on; switched off on the server too). If on: road IDs and times only, no positions, held back and mixed |

**Kept on the phone only:** callsign, chosen boroughs and settings; the search and route log (never cleared automatically; "Clear log" asks first); saved blocks and estates; up to five saved spots from "Where am I". Uninstalling the app deletes them.

**Never sent to TfL, National Highways or any other data source:** the server fetches road closures from them on a timer; nothing about crews goes the other way.

## Security of the server

- **Transport:** HTTPS only (Caddy, with certificates from Let's Encrypt). The API listens only on Docker's private network behind Caddy.
- **Logging:** request logging is turned off in the API (`disableRequestLogging`) and Caddy keeps no access log. Only failures are logged, with a status code and no request body, address or position.
- **Rate limiting:** 600 requests a minute per IP address, counted in memory and dropped each minute.
- **Secrets:** API keys (Ordnance Survey and National Highways) live only in the server's environment file and GitHub's encrypted secrets, never in the app.
- **Updates:** the server runs only the `main` branch, which code reaches only after the automated tests pass. It checks for new code every 5 minutes, applies it, runs its own checks (health, a London route, an address search) and goes back to the previous code if they fail. The map data is rebuilt weekly from OpenStreetMap, with checksums checked before it goes live and a fallback to the previous data if checks fail.
- **Monitoring:** an external uptime check every 5 minutes, and a fuller check (health, a route, an address search) from GitHub, scheduled every 10 minutes (GitHub runs it every few hours in practice).
- **Source code:** in a GitHub repository run by OPSVALE LTD; it can be made available for review on request.

## Team session encryption

- A team code is 120 random bits, written as 24 letters and digits.
- The team's ID on the server is a hash of the code, so the server can't work back to the code.
- Each phone seals its share (callsign, position, recent track) and every team message with XChaCha20-Poly1305, using a key derived from the code. The code and key are never sent to the server.
- Anyone holding the code can read the team's positions and messages, so the code is the access control: crews share it only with colleagues on the job.
- At a police station (public locations from OpenStreetMap) a phone stops sharing its position unless the crew turns that on.
- Code: `app/src/team/crypto.ts`, `docs/TEAM_SHARING.md`.

## On a force-managed phone (Intune or similar)

There is no special force build yet. What a force's mobile device management needs to allow:

- **Install:** `com.blueroute.patrol` from Google Play or the App Store (once listed), deployed as a managed app. It needs no app configuration to work.
- **Network:** outbound HTTPS to `api.bluerouteapp.com`, `tiles.openfreemap.org` and `u.expo.dev`.
- **Permissions:** location while in use; on Android, the foreground service notification.
- **Data:** nothing is stored in a cloud account and the app holds no force credentials. Work data on the phone is the log, saved places and saved spots, in the app's private storage.
- **Without installing anything:** the web app at https://bluerouteapp.com/app runs in the phone's browser or on a desk PC.

A force-specific build is possible later, if needed:
- a dedicated server instance;
- team sessions switched off;
- managed settings (callsign, boroughs, vehicle) pushed by MDM;
- or blue-light routes off.

## Starter for the force's DPIA

When a force deploys BlueRoute to its own officers, the force will usually be the data controller for that use and OPSVALE LTD a processor for the server side; a data processing agreement would set that out. For officers installing it themselves, OPSVALE LTD is the controller (as the privacy policy says).

Points a DPIA will want, with BlueRoute's answers:

| Question | Answer |
|---|---|
| Personal data processed by the server | Device position and destination, typed addresses, in memory only to answer the request; a hashed install ID for daily counts. Team data only in sealed form |
| Special category or criminal offence data | Not collected by design. Typed addresses could relate to an incident; they are not stored server-side (24-hour in-memory cache without any identifier). Team messages could contain such data if a crew types it in; they are end-to-end encrypted and deleted within 12 hours, and the terms tell crews to send only what their service allows |
| Retention | None for positions and addresses; 24 hours in memory for searches; 12 hours for team messages; a week at most for teams; daily and weekly count hashes deleted when the period ends |
| International transfers | Server in the EU (Hetzner, Germany or Finland), covered by the UK's adequacy regulations for the EU. Map tiles from OpenFreeMap; update checks to Expo (US) |
| Data subject rights | Nothing on the server is linked to a person. Data on the phone is under the officer's control (clear the log, uninstall) |
| Security | As above: HTTPS, no request logs, end-to-end encrypted team data, secrets server-side only |
| Risks to consider | Crew types incident details into a team message; personal phone lost with the search log on it (protected by the phone's own lock); reliance on routing advice (the app lists every restriction and the terms make the driver responsible) |

## Not in place yet

- **Cyber Essentials:** planned before any force evaluation (the go-to-market roadmap says buy it by 31 March 2027 while the discount runs).
- **Penetration test and Cyber Essentials Plus:** not done; would follow a paid force licence.
- **Data processing agreement:** no template yet; a solicitor's review is planned once there is income.
- **Managed app configuration:** not built.
- **Single sign-on:** not built, and not needed: there are no accounts.
