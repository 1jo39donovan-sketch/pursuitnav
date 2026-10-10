# Getting Blue Route onto the App Store and Google Play

Plan written 10 October 2026, for officers installing it from the stores by **Friday 23 October**.

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
- **The name.** "Blue Route" may already be taken on one of the stores. If it is, use "Blue Route Patrol" (only the name on the store changes).
- **The server must be up first** (DEPLOY.md). The stores need the privacy policy at `https://SERVER_DOMAIN/privacy`.
- **Optionally set a contact address.** In GitHub, add the variable `CONTACT_EMAIL` (for example a new Gmail address just for Blue Route) so it appears on the privacy and support pages, then run **Deploy server** with **recreate** ticked. Without it, the pages point to GitHub issues.

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
      bash app/scripts/setup-ios.sh blueroute-yourname.duckdns.org
      ```
      (your SERVER_DOMAIN).
   3. Sign in to Expo, then to Apple, and say yes when it offers to create the certificate, provisioning profile and app.
   4. The build takes about 20–30 minutes, then goes to TestFlight.
3. In [App Store Connect](https://appstoreconnect.apple.com), open the new app. The number in the address after `/apps/` is its **App ID**.
4. Create an API key:
   1. Go to **Users and Access → Integrations → App Store Connect API → Team Keys → +**.
   2. Name it "Blue Route builds" and give it the **App Manager** role.
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
2. **Create app**: name Blue Route, English (UK), App, Free.
3. Work through **Dashboard → Set up your app**, using the answers in "Store listing" and "Privacy answers" below.
4. **Service account** (lets GitHub upload builds):
   1. In [Google Cloud console](https://console.cloud.google.com), create a project, enable the **Google Play Android Developer API**, and create a **service account**.
   2. On the service account, create a **JSON key** and download it.
   3. In Play Console, go to **Users and permissions → Invite new users**, add the service account's email address, and give it **Release to testing tracks** and **Manage testing tracks** for Blue Route.
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

## Store listing

**Name:** Blue Route
**Subtitle (Apple, 30 characters):** Patrol navigation for London
**Short description (Google, 80 characters):** Address search, routes and a pursuit screen for police officers in London.
**Category:** Navigation (Apple) / Maps & Navigation (Google)
**Price:** Free · no ads · no in-app purchases
**Age rating:** 4+ / Everyone (no objectionable content). Target audience on Google: 18 and over.
**Privacy policy:** `https://SERVER_DOMAIN/privacy`
**Support URL:** `https://SERVER_DOMAIN/support`

**Description:**

> Blue Route is navigation built for police officers on patrol in London, by officers' needs rather than a general sat-nav.
>
> SEARCH THE WAY CONTROL GIVES IT
> Type what the control room says: a road, "54 Caledonian Rd", "Flat 3, 54 Caledonian Road", a postcode, an outward code like N7, or an estate or block by name. Misspellings are forgiven. Pick the boroughs you're working at the start of a shift and their results come first, so you get the right Church Street first time. Road search works with no signal.
>
> PLACES
> Find shops, cafés, takeaways, pubs, schools, parks, stations, health services and more by name, or list every one of a kind in your boroughs. Shown on the map, and searchable offline.
>
> TWO ROUTES, YOUR CHOICE
> Every search gives journey times from where you are now. Police drivers can turn on a second route that uses bus lanes and bus gates and ignores turn restrictions, never the wrong way down a one-way street, shown only when it's meaningfully faster and always listing each restriction it relies on. You choose; it never routes through a restriction without telling you.
>
> TURN-BY-TURN
> Large, glanceable directions for the operator, with automatic re-routing. Or hand over to Google Maps or Waze.
>
> PURSUIT SCREEN
> Speed, the road's speed limit (or "—" when it isn't known, never a guess), road name, heading, borough, next junction and the area you're heading towards, with a heading-up map. Updates every second, keeps the screen awake.
>
> LOG
> Every search and route picked is kept on your phone until you clear it.
>
> PRIVATE BY DESIGN
> No accounts, adverts or tracking. Addresses and your log stay on your phone; the server works out routes without keeping anything.
>
> Blue Route is independent and is not affiliated with or endorsed by the Metropolitan Police Service or any police force. Police routes are for police drivers using the emergency exemptions only. Covers London.

**Keywords (Apple, 100 characters):** `police,patrol,London,borough,sat nav,route,bus lane,pursuit,address,postcode,officer,navigation`

**What's new (first release):** First release for officers in London.

### Notes for the reviewers (App Review Information / App access)

> Blue Route is navigation for police officers in London. No account or login is needed.
>
> To try it outside London: on the Session tab, turn on "Demo drive". It simulates driving through north London, so search, routes, turn-by-turn and the Pursuit tab all work. For example, search "Caledonian Road" or "N7", pick a result, and compare the routes.
>
> The second "Police" route (bus lanes, bus gates, ignoring turn restrictions, never against one-way streets) is off by default. It appears only after the user confirms, on the Session tab under Police routes, that they are a police officer driving under the emergency exemptions. Without that, the app gives standard, fully legal routes only. When a police route is shown, every restriction it uses is listed and the user chooses.
>
> The app is independent and not affiliated with any police force. Location is used only while the app is open.

Google's **App access** question: choose "All or some functionality is restricted" and paste the same text, so the reviewer knows how to see police routes.

### Screenshots

In `store/`:

- `iphone-1-session.png` (1290 × 2796, the 6.7" iPhone slot) and `android-1-session.png` (1080 × 1920): the Session tab.
- `feature-graphic.png` (1024 × 500) and `play-icon.png` (512 × 512) for Play.

Apple needs at least 3 screenshots and Play at least 2. Take the rest on your phone once the server is up, using **Demo drive** so no real job addresses or locations appear:

1. Search results for "stroud green rd".
2. The two route cards for an address (turn on police routes first).
3. Turn-by-turn navigation.
4. The Pursuit tab.
5. The Log.

On iPhone, use a 6.7" or 6.9" model if you can (otherwise Apple asks for that size). Any modern Android phone is fine.

## Privacy answers

### Apple: App Privacy

Answer **"Data Not Collected"**. The app sends positions and searched addresses to the Blue Route server only to answer each request in real time, and nothing is kept. Apple doesn't count real-time processing that isn't retained as collection. There's no tracking.

### Google: Data safety

- **Does your app collect or share any of the required user data types?** Yes.
- **Location → Approximate location and Precise location:** Collected, not shared.
  - Processed ephemerally: **Yes**.
  - Required: **Yes**.
  - Purpose: **App functionality**.
- No other data types.
- **Is all of the user data encrypted in transit?** Yes.
- **Do you provide a way for users to request that their data is deleted?** Nothing is kept on the server. Data on the phone is deleted by clearing the log or uninstalling.

Other Play questions: **Ads:** No. **Government app:** No. **News app:** No. **Financial features:** None. **Health:** No.

## Day by day

Day 1 is Saturday 10 October.

| Day | You | Claude / GitHub |
|---|---|---|
| **1 (Sat 10)** | Merge the pull request. Pay for Apple and Google and start verification. Create the Expo account and add `EXPO_TOKEN`. Run **Deploy server** (DEPLOY.md). | Code, store pipeline and this pack are ready. |
| **2 (Sun 11)** | Check the server answers at `/health` and `/privacy`. Try the Android test APK on your phone. Line up 15+ officers for the Android closed test (their Gmail addresses). | Fix anything you find. |
| **3 (Mon 12)** | Once Apple has approved you, do the Codespaces iOS step. Add the Apple variables and secret. | First iOS build goes to TestFlight. |
| **4 (Tue 13)** | Once Google has verified you, create the app in Play Console and fill in the listing, content rating and data safety. Set up the service account. Do the first manual `.aab` upload to closed testing and send it for review. | |
| **5 (Wed 14)** | TestFlight: add an external group, turn on the **public link**, and submit for Beta App Review (usually about a day). Install it yourself and test in a car. | Fix anything from your test. |
| **6–7 (Thu 15–Fri 16)** | When the closed test is approved, send officers the Play join link. When TestFlight is approved, send iPhone users the TestFlight link. **Get 12+ Android officers to join, install and keep it installed: the 14-day clock starts here.** | Run **Store builds** for any fixes. |
| **8 (Sat 17)** | Fill in the App Store listing (text and screenshots above) and **Submit for Review** for the App Store. | |
| **9–11** | Answer any questions from Apple's review. If it's rejected, tell Claude what Apple said. | Fix and resubmit the same day. |
| **12–14 (Wed 21–Fri 23)** | **App Store live**: send iPhone users the App Store link. Android officers are on the Play closed test. | |
| **~20–25** | After 14 days with 12+ testers, apply for production access in Play Console. Once Google approves it, release to production; it then appears in Play search. | Run **Store builds** with track *production*. |

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

- door-level address search beyond the OS Places free allowance
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
4. **Create the subscription in both stores.** For example "Blue Route Plus", £3.99 a month, one-month free trial, sold in the UK only.
5. **Create a RevenueCat account** (free) and connect it to App Store Connect and Play Console. Its setup screens walk you through this.
6. **Ask Claude to build it.** Claude adds RevenueCat, the subscribe and restore screens, a terms of use page, and the privacy policy changes, then locks the chosen features. If any of them run on the server, the server checks the subscription too.
7. **Update the privacy answers:**
   - Apple: "Purchases", used for app functionality and not linked to identity.
   - Google: "Purchase history".
8. **Release it** through **Store builds** as a normal update. Apple and Google review the first subscription together with that version.

## If something goes wrong

- **Apple rejects it under guideline 1.4 (physical harm) or 5 (legal) because of the police route.** Reply in Resolution Center explaining that police routes are off by default and only appear after the user declares they're a police driver under the emergency exemptions, and point to the reviewer notes. If Apple still says no, ask Claude to leave police routes out of the iOS store build only (a small change). Officers still get search, standard routes, navigation, pursuit mode and the log, and TestFlight can carry the full version.
- **The Play closed test is stuck in review.** New accounts are often slower. It usually clears within 7 days. In the meantime, Android officers can use the APK from the GitHub release page.
- **Fewer than 12 Android testers join.** The production clock doesn't start until 12 are opted in. Testers have to join through the link, not just be on the list.
