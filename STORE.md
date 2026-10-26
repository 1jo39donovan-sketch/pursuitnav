# Getting BlueRoute onto the App Store and Google Play

Plan written 10 October 2026; listing, privacy answers and launch plan updated 25 October 2026.

## What's realistic in 14 days

| | By day 14 | Public listing |
|---|---|---|
| **iPhone** | On the **App Store**, if Apple's review passes first or second time. **TestFlight** (a public invite link, up to 10,000 people) is the fallback and usually works within days 4–6. | Same thing. |
| **Android** | On **Google Play as a closed test**: officers tap an invite link, join, and install from the Play Store like any app. Updates come through Play. | Not before about **day 20–25**. Google makes new personal developer accounts run a closed test with **at least 12 testers for 14 days in a row** before the app can go public, then reviews the request (up to about 7 days). |

Officers get the app through the stores in time on both platforms. Only the public Play listing comes later, and the closed test the officers join is what unlocks it. Start it early, and get 12 or more officers to join on day one.

Check the current rules when you sign up. Google's tester rule has changed before: it was 20 testers, then 12.

## Costs

- **Apple Developer Program:** US$99 a year (£79 in the UK).
- **Google Play Console:** US$25, paid once.
- **Expo (EAS):** free. The free plan includes a monthly allowance of cloud builds, which is plenty for this.
- **Server:** already covered (DEPLOY.md), about €6–7 a month.

Charging officers nothing is fine on both stores: list it as a free app.

## Before you start

- **Use a personal developer account.** Your name will show as the seller. An organisation account needs a D-U-N-S number, which can take weeks.
- **Don't use Met or police branding.** Don't use the Met name, crest or logos, and don't say "official". The listing below says it's independent and lists the police route as needing the user's declaration. Apple and Google both reject apps that look as if they're from an organisation they aren't.
- **The name.** "BlueRoute" may already be taken on one of the stores. If it is, use "BlueRoute Patrol" (only the name on the store changes).
- **The server is up** at `api.bluerouteapp.com`, and the privacy, support and terms pages the stores ask for are at `https://bluerouteapp.com/privacy`, `/support` and `/terms`.
- **Contact address.** Google emails the listing's contact address. `support@bluerouteapp.com` receives mail (checked 26 October: it forwards to the hello@ inbox at Purelymail), and it's the app's "Report a problem" address too. To show it on the privacy and support pages, add the GitHub variable `CONTACT_EMAIL` and run **Deploy server** with **recreate** ticked. Without it, the pages point to GitHub issues.

## One-off setup

### Expo (builds both apps)

1. Sign up at [expo.dev](https://expo.dev).
2. Go to **Account settings → Access tokens → Create token**.
3. In GitHub, add the secret `EXPO_TOKEN` with the token as its value.

### Apple

1. Enrol at [developer.apple.com/programs](https://developer.apple.com/programs/enroll/) as an **individual**. Your Apple ID needs two-factor authentication turned on. Approval usually takes 1–2 days.
2. **First iOS build, once.** No Mac is needed.
   1. On the repository page on GitHub, click **Code → Codespaces → Create codespace** (free).
   2. In the terminal that opens, run:
      ```
      bash app/scripts/setup-ios.sh api.bluerouteapp.com
      ```
      (the server's address).
   3. Sign in to Expo, then to Apple, and say yes when it offers to create the certificate, provisioning profile and app.
   4. The build takes about 20–30 minutes, then goes to TestFlight.
3. In [App Store Connect](https://appstoreconnect.apple.com), open the new app. The number in the address after `/apps/` is its **App ID**.
4. Create an API key:
   1. Go to **Users and Access → Integrations → App Store Connect API → Team Keys → +**.
   2. Name it "BlueRoute builds" and give it the **App Manager** role.
   3. Download the `.p8` file. You can only download it once.
5. In GitHub, add these:
   - Variable `ASC_APP_ID`: the App ID from step 3.
   - Variable `ASC_KEY_ID`: the key's ID.
   - Variable `ASC_ISSUER_ID`: the Issuer ID shown above the keys.
   - Variable `APPLE_TEAM_ID`: from developer.apple.com → Account → Membership.
   - Secret `ASC_API_KEY_P8`: open the `.p8` file in a text editor and paste all of it, including the BEGIN and END lines.

After this, every iOS build runs from GitHub with no questions. Once a year, when Apple's certificate expires, run the Codespaces step again.

### Google

1. Sign up at [play.google.com/console](https://play.google.com/console) with a **personal** account and pay the US$25. Identity verification can take a few days, so start on day 1.
2. **Create app**: name BlueRoute, English (UK), App, Free.
3. Work through **Dashboard → Set up your app**, using the answers in "Store listing" and "Privacy answers" below.
4. **Service account** (lets GitHub upload builds):
   1. In [Google Cloud console](https://console.cloud.google.com), create a project, enable the **Google Play Android Developer API**, and create a **service account**.
   2. On the service account, create a **JSON key** and download it.
   3. In Play Console, go to **Users and permissions → Invite new users**, add the service account's email address, and give it **Release to testing tracks** and **Manage testing tracks** for BlueRoute.
   4. In GitHub, add the secret `PLAY_SERVICE_ACCOUNT_JSON` and paste the whole JSON file into it.
5. **First upload by hand** (Google requires this once):
   1. In GitHub, run **Actions → Store builds** with platform **android** and **send to stores** unticked.
   2. Download the `.aab` file from the build on expo.dev.
   3. In Play Console, go to **Test and release → Testing → Closed testing**, create a track (the default "Closed testing - Alpha"), add testers (a Google Group or a list of email addresses), upload the `.aab`, and **send it for review**.
6. Copy the **join link** from the closed test's Testers tab. That link is what you send officers.

After this, **Store builds** uploads every new Android version to the closed test by itself. Leave **release status** on *draft* and press **Send for review** in Play Console, until Google has approved the first release. After that, choose *completed* and the release goes out with no further steps.

**Officers who installed the test APK** from the GitHub release page need to uninstall it before installing from Play, because the two versions are signed differently. Uninstalling deletes their log.

## Releasing an update (after setup)

1. Run **Actions → Store builds → Run workflow** (platform *all*, send to stores ticked).
2. **iPhone:** about 30–40 minutes later it's in TestFlight. To update the App Store version, go to App Store Connect → the app → **+ Version**, pick the build, and **Submit for Review**.
3. **Android:** it's in the closed test as a draft (press **Send for review**) or, once approved, live for testers.

Version numbers count up automatically.

Most changes don't need this: with `EXPO_TOKEN` set, changes to the app's code reach store installs over the air too (DEPLOY.md, "App updates"), within the stores' rules for updates that fix and improve the app without changing what it is. A new store build is needed only when the App update summary says the change is native, or to change the listing.

## Store listing (ready to paste)

Checked 25 October 2026 against the app as it is now. The privacy policy, support page and terms are live at `https://bluerouteapp.com/privacy`, `/support` and `/terms` (the same pages are on `https://api.bluerouteapp.com`).

| Field | Apple (App Store Connect) | Google (Play Console) |
|---|---|---|
| **Name** (30 max) | BlueRoute – Response Sat Nav | BlueRoute – Response Sat Nav |
| **Subtitle** (Apple, 30 max) | Blue-light navigation | |
| **Short description** (Google, 80 max) | | Blue-light navigation for emergency services: police, ambulance and fire. |
| **Category** | Navigation (secondary: Utilities) | Maps & Navigation |
| **Price** | Free, no in-app purchases | Free, no in-app purchases, no ads |
| **Privacy policy URL** | `https://bluerouteapp.com/privacy` | `https://bluerouteapp.com/privacy` |
| **Support URL** | `https://bluerouteapp.com/support` | Website: `https://bluerouteapp.com` |
| **Marketing URL** (optional) | `https://bluerouteapp.com` | |
| **Contact email** | | `support@bluerouteapp.com` (it must receive mail: Google emails it) |
| **Copyright** | © 2026 *your legal name* (fill in) | |
| **Bundle ID / package** | `com.blueroute.patrol` | `com.blueroute.patrol` |

The name under the icon on the phone stays **BlueRoute**. If the name is taken in either store, use "BlueRoute Patrol – Sat Nav" (26 characters).

**Keywords** (Apple, 100 max, commas, no spaces):

```
blue light,emergency,police,ambulance,fire,satnav,bus lane,pursuit,postcode,999,response,officer
```

**What's new** (first release): `First release.`

**Promotional text** (Apple, 170 max, can change any time without review):

> Built with crews on London's roads: search the way control gives it, two routes side by side, big turn-by-turn and a pursuit screen. No account, no tracking.

**Description** (both stores, 4,000 max; this is about 2,600):

> BlueRoute is blue-light navigation built for emergency services (police, ambulance and fire), around crews' needs rather than a general sat nav. It's made for the operator in the passenger seat: big text, few taps, spoken directions.
>
> SEARCH THE WAY CONTROL GIVES IT
> Type what the control room says: a road, "54 Caledonian Rd", "Flat 3, 54 Caledonian Road", a postcode, an outward code like N7, or an estate or block by name. Misspellings and nicknames are forgiven ("Cally Road"). Pick the boroughs you're working at the start of a shift and their results come first, so you get the right Church Street first time. Recent and favourite places sit at the top, and road search works with no signal.
>
> PLACES AND THE NEAREST A&E
> Find shops, cafés, takeaways, pubs, schools, parks, stations, hospitals and more by name, or list every one of a kind in your boroughs. One tap for the nearest A&E. Tap any building on the map for its address and a route there.
>
> TWO ROUTES, YOUR CHOICE
> Every search gives journey times from where you are now, sized to your vehicle (car to fire appliance) so it never sends you under a low bridge or down a road too narrow. A blue-light route that uses bus lanes and bus gates and ignores turn restrictions is offered beside the standard route when it's meaningfully faster. It never goes the wrong way down a one-way street, and it lists every restriction it relies on. You choose; it never routes through a restriction without telling you. Roads TfL lists as closed are avoided automatically.
>
> TO THE DOOR *(paste only once building entrances are live, after the weekly map build around 31 October; otherwise leave this paragraph out)*
> Where the map knows the way into a block, the route ends at the entrance, not the middle of the building. Keep your own notes on blocks and estates.
>
> TURN-BY-TURN
> Large, glanceable directions with spoken turns, which side the destination is on, automatic re-routing, and a map that carries on with no signal (download the offline map on Wi-Fi). Day and night maps, heading-up or 3D, a larger text setting, and an Ordnance Survey map style. Or hand over to Google Maps or Waze.
>
> PURSUIT SCREEN
> Speed, the road's speed limit (or "—" when it isn't known, never a guess), road name, heading, borough, next junction and the area you're heading towards, with a heading-up map. Updates every second and keeps the screen awake.
>
> WHERE AM I
> Your nearest address, postcode, OS grid reference and how accurate the fix is, ready to read out or share.
>
> TEAM SESSIONS
> Opt in, share a code, and see colleagues on the map while the app is open. Follow in along a colleague's track. End-to-end encrypted: the server can't read it.
>
> LOG
> Every search and route picked is kept on your phone until you clear it.
>
> PRIVATE BY DESIGN
> No accounts, no ads and no third-party analytics. Addresses and your log stay on your phone; the server works out routes without logging them.
>
> BlueRoute is independent and is not affiliated with or endorsed by any police, ambulance or fire service. Blue-light routes are for emergency-service drivers using the exemptions only, and can be turned off. Maps and search cover London for now, with more areas to come.

### Notes for the reviewers (Apple "App Review Information"; Google "App access")

Apple: no sign-in needed, so leave the demo account blank. Paste this in **Notes**. Google: choose **All functionality is available without any access restrictions**, then paste the same text into **Instructions** anyway so the reviewer knows about Demo drive.

> BlueRoute is blue-light navigation for emergency services (police, ambulance and fire). Maps and search cover London for now. No account or login is needed.
>
> To try it outside London: on the Session tab, turn on "Demo drive". It simulates driving through north London, so search, routes, turn-by-turn and the Pursuit tab all work. For example, search "Caledonian Road" or "N7", pick a result, and compare the two routes.
>
> The "Blue light" route (bus lanes, bus gates, ignoring turn restrictions, never against one-way streets) is on by default, by design: the app is for emergency-service drivers using the legal exemptions, and the first launch asks the user to accept terms that say so. It can be turned off on the Session tab, and then the app gives standard, fully legal routes only. The standard route is always offered beside it; when a blue-light route is shown, every restriction it uses is listed and the user chooses.
>
> The app is independent and not affiliated with any police, ambulance or fire service. Location is used only while the app is open.

### Other questions in the forms

**Apple**

- **Age rating** (questionnaire): answer **None / No** to every question, including unrestricted web access, user-generated content and messaging (team sessions only share a position and callsign with people who have the code; there's no chat). Result: 4+.
- **Encryption** (export compliance): already answered in the app (`ITSAppUsesNonExemptEncryption: false`), so App Store Connect won't ask. The app uses HTTPS and, for team sessions, standard published ciphers to protect users' own data; nothing proprietary. If Apple does ask, say it uses only standard encryption and no proprietary algorithms.
- **Content rights**: "Does your app contain, show, or access third-party content?" **Yes**, and confirm you have the rights: OpenStreetMap (ODbL), Ordnance Survey OpenData (Open Government Licence) and TfL open data (credited in the app).
- **Advertising identifier (IDFA)**: **No**.

**Google**

- **Ads**: No. **Target audience**: 18 and over only. **News app**: No. **Government app**: No (it's independent). **Financial features**: None. **Health**: None. **COVID-19**: not a contact tracing or status app.
- **Content rating** (IARC questionnaire): category **All Other App Types**. Answer **No** to every question except one: "Does the app share the user's current physical location with other users?" is **Yes**, because team sessions do when the user opts in. That adds a "Shares location" note but doesn't change the age. Result: Everyone / PEGI 3.
- **Permissions**: the app uses location only while open (no background location), so no permission declaration form is needed. If Play asks about foreground service or exact alarms, the answer is that the app doesn't use them.

### Screenshots

The PM took both sets at these sizes on 26 October (round 5). Retake the Android route-choice and navigation shots after the 26 October layout fixes, which stop the times being cut off at that size. Use **Demo drive** so no real job addresses appear, and take Session from the top of the page.

| Store | Slot | Size (pixels) | How many |
|---|---|---|---|
| Apple | iPhone 6.9" | **1320 × 2868** (1290 × 2796 also accepted) | 3 to 10; Apple scales them down for smaller iPhones |
| Apple | iPad | not needed: the app is iPhone only | |
| Google | Phone | **1080 × 2160** (2:1 exactly; no side may be more than twice the other) | 2 to 8 |
| Google | Feature graphic | 1024 × 500 (`store/feature-graphic.png`) | 1 |
| Google | App icon | 512 × 512 (`store/play-icon.png`) | 1 |

Order, both stores:

1. Search ("stroud green rd" or "Bemerton", results in Islington)
2. Route choice (Standard beside Blue light, with the restrictions listed)
3. Turn-by-turn navigation (day)
4. Turn-by-turn navigation (night)
5. Pursuit screen
6. Start of shift (Session: callsign, boroughs, vehicle)

## Privacy answers (ready to paste)

What leaves the phone, checked against the code on 25 October 2026:

| Data | Where to | Kept? | Counts as |
|---|---|---|---|
| Position and destination for routes, pursuit, Where am I, entrances | BlueRoute server | No: answered in memory, not logged | Not collected (real-time processing) |
| Search text (what was typed) | BlueRoute server, then OS Names | **Up to 24 hours in memory**, as a speed-up cache, with no ID, IP or position | **Collected** (Search history), not linked |
| Random install ID, app version, counts of routes, sessions, timeouts | BlueRoute server | Daily totals; salted hashes deleted when the day or week ends | **Collected** (Device ID, Product interaction, Diagnostics), not linked |
| Expo's update check: runtime version, platform, random update ID | Expo (works for us) | Expo's own terms | **Collected** (Device ID), not linked |
| Team sessions: callsign, position, track | Other team members, through the server | Sealed, in memory, up to a week | Not collected: end-to-end encrypted, the server can't read it |
| Learning: per-road timings | BlueRoute server | Totals per road | **Not yet**: switched off on the server (`LEARNING` not set). See below |
| Report a problem | The user's own mail app | | Not collected by the app: the user sends the email |
| Log, callsign, boroughs, notes, favourites, field-test trips | Phone only | | Not collected |

### Apple: App Privacy

**Data collection**: "Yes, we collect data from this app". Then tick these four, and for each answer **Linked to the user's identity: No** and **Used for tracking: No**:

| Data type | Purposes |
|---|---|
| **Identifiers → Device ID** | Analytics, App Functionality |
| **Usage Data → Product Interaction** | Analytics |
| **Diagnostics → Other Diagnostic Data** | Analytics |
| **Search History** | App Functionality |

Don't tick Location. Positions are only processed in real time to answer each request and aren't kept, which Apple doesn't count as collection, and team-session positions are end-to-end encrypted so neither you nor the server can read them.

The label will then say **"Data Not Linked to You"** with those four, and nothing under "Data Used to Track You".

### Google: Data safety

**Data collection and security**

- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes**
- Which of the following methods of account creation does your app support? **My app does not allow users to create an account**
- Do you provide a way for users to request that their data is deleted? **No** (there are no accounts; the server deletes the hashes when the day or week ends, and the search cache within 24 hours, by itself)

**Data types**: tick these and nothing else:

| Data type | Collected / shared | Processed ephemerally? | Required or optional? | Purposes |
|---|---|---|---|---|
| **Location → Precise location** | Collected, not shared | **Yes** | Required | App functionality |
| **Location → Approximate location** | Collected, not shared | **Yes** | Required | App functionality |
| **App activity → In-app search history** | Collected, not shared | **No** (24-hour cache) | Required | App functionality |
| **App activity → Other actions** | Collected, not shared | No | Required | Analytics |
| **App info and performance → Diagnostics** | Collected, not shared | No | Required | Analytics |
| **Device or other IDs** | Collected, not shared | No | Required | Analytics |

"Not shared" is right for all of them: Ordnance Survey and Expo act for us as service providers, which Google doesn't count as sharing. Team-session data is end-to-end encrypted, which Google doesn't count as collected.

### If the answers need to change

- **Turning learning on** (`LEARNING=1` on the server): add Apple **Location → Coarse Location** (App Functionality, not linked) and Google **Location → Approximate location** with processed ephemerally **No** and **Optional**. Update both before turning it on.
- **Dropping the search cache** would take Search history off both labels, at the cost of repeat searches taking a few hundred milliseconds longer. Your call; the answers above assume the cache stays.
- **Adding a subscription**: see "Later: a subscription" below.

## Launch plan

The first plan (10 to 23 October) waited on the accounts, which aren't set up yet. Counting from the day you pay for them:

| Day | You | Claude / GitHub |
|---|---|---|
| **1** | Pay for Apple (£79) and Google ($25) and start identity checks. Create the Expo account and add `EXPO_TOKEN`. | |
| **2–3** | Once Apple has approved you, do the Codespaces iOS step and add the Apple variables and secret. | First iOS build goes to TestFlight. |
| **3–4** | Once Google has verified you, create the app in Play Console, paste the listing, content rating and data safety above, set up the service account, and do the first manual `.aab` upload to closed testing. | |
| **4–5** | TestFlight: add an external group, turn on the public link, submit for Beta App Review (about a day). | |
| **5–7** | Send officers the TestFlight and Play join links. **Get 12+ Android officers to join and keep it installed: Google's 14-day clock starts here.** | Fix anything they find. |
| **6** | Paste the App Store listing and screenshots and **Submit for Review**. | |
| **7–10** | Answer Apple's questions. If it's rejected, send Claude what Apple said. | Fix and resubmit the same day. |
| **~10** | App Store live. | |
| **~20–28** | After 14 days with 12+ testers, apply for production access in Play Console. | Run **Store builds** with track *production* once approved. |

## Later: a subscription (£3–5 a month)

Launch free, so the 14-day plan isn't held up and officers join the test. Add the subscription as an update once you've decided what it unlocks. Nothing in the free launch has to change to allow it.

### How it works

- **You must use the stores' payment systems.** Anything unlocked inside the app has to be sold through Apple's and Google's in-app purchase. In the UK you can't send people to your own website to pay instead. The UK competition regulator (CMA) is still consulting on whether to allow that.
- **What you'd keep.** Apple and Google each take 15%:
  - Apple takes 15% if you join its free Small Business Program (for earnings under US$1m a year).
  - Google takes 15% on subscriptions from the first payment.

  UK prices include 20% VAT, which comes off first:

  | Price | After VAT | You keep (about) |
  |---|---|---|
  | £2.99 | £2.49 | £2.12 |
  | £3.99 | £3.33 | £2.83 |
  | £4.99 | £4.16 | £3.53 |

- **Free trials and yearly plans** are both supported.
- **No accounts needed.** The subscription is tied to the officer's Apple ID or Google account. RevenueCat checks who has paid; it's free until about US$2,500 a month in revenue, then takes 1%.
- **Store rules:**
  - The subscription must give ongoing value.
  - The app must show the price and renewal terms before purchase.
  - It needs a "Restore purchases" button and a link to terms of use.
  - The privacy policy and privacy answers must cover purchases.
- **Your details become public.**
  - Google has required sellers to show a physical address on the store listing. A PO box or virtual office may do; check the current Play Console rules.
  - Apple shows your address and phone number if you sell in the EU. Selling in the UK only avoids that.
- **Tax.** Earnings go on a Self Assessment tax return. The first £1,000 a year is covered by the trading allowance.
- **If you're a serving officer, check with your force first.** Police Regulations require business interests to be declared, and selling an app to colleagues for use on duty is likely to count.

### Ideas for what it could unlock

Collect feedback during the test before deciding. Good candidates are things that cost money to run or that heavy users value most:

- door-level address search for flats and named buildings (OS Places is paid per search)
- extra areas beyond London, when UK-wide coverage comes
- longer or exportable logs
- live traffic-aware journey times

Keep safety features free: the one-way protection, the "—" for unknown speed limits, and listing every restriction a police route uses.

### Steps

1. **Decide what the subscription unlocks**, using officers' feedback from the test.
2. **Check with your force** about declaring a business interest.
3. **Set up to get paid:**
   1. Apple: in App Store Connect, go to **Business**, sign the **Paid Apps agreement**, and add bank and tax details.
   2. Apple: join the **Small Business Program** for the 15% rate.
   3. Google: in Play Console, go to **Settings → Payments profile** and set it up.

   Verification can take several days.
4. **Create the subscription in both stores.** For example "BlueRoute Plus", £3.99 a month, one-month free trial, sold in the UK only.
5. **Create a RevenueCat account** (free) and connect it to App Store Connect and Play Console. Its setup screens walk you through this.
6. **Ask Claude to build it.** Claude adds RevenueCat, the subscribe and restore screens, a terms of use page, and the privacy policy changes, then locks the chosen features. If any of them run on the server, the server checks the subscription too.
7. **Update the privacy answers:**
   - Apple: "Purchases", used for app functionality and not linked to identity.
   - Google: "Purchase history".
8. **Release it** through **Store builds** as a normal update. Apple and Google review the first subscription together with that version.

## If something goes wrong

- **Apple rejects it under guideline 1.4 (physical harm) or 5 (legal) because of the police route.** Reply in Resolution Center explaining that blue-light routes are for emergency-service drivers under the emergency exemptions, are always offered beside a fully legal standard route with every restriction listed, and can be turned off on the Session tab, and point to the reviewer notes. If Apple still says no, ask Claude to leave police routes out of the iOS store build only (a small change). Officers still get search, standard routes, navigation, pursuit mode and the log, and TestFlight can carry the full version.
- **The Play closed test is stuck in review.** New accounts are often slower. It usually clears within 7 days. In the meantime, Android officers can use the APK from the GitHub release page.
- **Fewer than 12 Android testers join.** The production clock doesn't start until 12 are opted in. Testers have to join through the link, not just be on the list.
