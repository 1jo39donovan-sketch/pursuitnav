// The privacy policy and support pages the app stores ask for. Plain HTML,
// served by the API so they live at the same address as the server.

const ISSUES_URL = "https://github.com/1jo39donovan-sketch/pursuitnav/issues";
// Change TERMS_VERSION in app/src/components/TermsGate.tsx with it, so crews agree again.
const UPDATED = "25 October 2026";

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function contact(email: string | undefined): string {
  return email
    ? `email <a href="mailto:${escape(email)}">${escape(email)}</a>`
    : `open an issue at <a href="${ISSUES_URL}">${ISSUES_URL}</a> (don’t include addresses or anything identifying)`;
}

// The logo (brand/logo.svg), inline: no extra request, and it's also the tab icon.
const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="180" fill="#0c1220"/>' +
  '<path d="M300 700V520a120 120 0 0 1 120-120h180" fill="none" stroke="#ffb627" stroke-width="88"/>' +
  '<circle cx="300" cy="760" r="106" fill="#0c1220"/><circle cx="300" cy="760" r="78" fill="#3d8bff"/>' +
  '<polygon points="600,290 760,400 600,508" fill="#fff" stroke="#fff" stroke-width="36" stroke-linejoin="round"/></svg>';
const FAVICON = `data:image/svg+xml,${encodeURIComponent(LOGO)}`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · BlueRoute</title>
<link rel="icon" href="${FAVICON}">
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0c1220; color: #e6ebf5; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 42rem; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { color: #f5b301; font-size: 1.8rem; margin: 0 0 4px; }
  h2 { font-size: 1.15rem; margin: 28px 0 6px; }
  a { color: #f5b301; }
  .muted { color: #8a96ad; font-size: 0.9rem; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-weight: 700; font-size: 1.1rem; }
  .brand svg { width: 40px; height: 40px; }
  .brand b { color: #3d8bff; }
  li { margin: 4px 0; }
</style>
</head>
<body><main>
<div class="brand">${LOGO}<span>Blue<b>Route</b></span></div>
<h1>${title}</h1>
${body}
</main></body>
</html>`;
}

export function privacyPage(email?: string): string {
  return page(
    "Privacy policy",
    `<p class="muted">BlueRoute · last updated ${UPDATED}</p>

<p>BlueRoute is a navigation app for police, fire and ambulance crews. It’s an independent app, not a police force or emergency service
system. It has no accounts and no third-party analytics. It counts how much it's used, in the way described
under “Usage counts” below.</p>

<h2>Kept on your phone only</h2>
<ul>
  <li>Your callsign, the boroughs you pick, and your settings.</li>
  <li>Blocks and estates you save, and your notes for a BCU or borough.</li>
  <li>The log of your searches and the routes you picked.</li>
</ul>
<p>None of this is sent anywhere. It stays until you clear the log in the app or uninstall it.</p>

<h2>Sent to the BlueRoute server, and not kept</h2>
<p>To answer a request the app sends the BlueRoute server only what that request needs:</p>
<ul>
  <li><strong>Routes:</strong> your current position (and direction of travel, when moving) and the destination’s
    position.</li>
  <li><strong>Address search:</strong> the address you typed. The server looks up house numbers itself, in its own
    copy of OpenStreetMap, and passes the search to Ordnance Survey’s OS Names API for postcodes, roads and places
    (and to OS Places too, only on a server set up with it). For speed, the server keeps searches and their answers
    in memory for up to 24 hours; they’re never written to disk or logged.</li>
  <li><strong>Pursuit mode:</strong> your last few positions and direction of travel, to find the road and its speed
    limit.</li>
  <li><strong>Where am I</strong> and <strong>tapping a building on the map:</strong> that point, to find the nearest
    address and postcode.</li>
  <li><strong>Building entrances:</strong> the destination’s position, to find the ways into the building there.</li>
  <li><strong>OS road map</strong> (only if you pick that map style): which part of the map is being shown. The server
    fetches it from Ordnance Survey itself, so OS doesn’t see your phone.</li>
  <li><strong>Follow in</strong> (team sessions): your position and the colleague’s recent track, to work out the way
    they drove.</li>
</ul>
<p>The server works out the answer in memory and keeps nothing: it doesn’t log requests, positions or addresses, and
has no database of users. Connections use HTTPS.</p>

<h2>Team sessions (only if you start or join one)</h2>
<p>In a team, while BlueRoute is open, your phone shares your callsign, position and the way you’ve driven in the last
two hours with the others in the team, every 15 seconds. It’s encrypted on your phone with a key that’s part of the team
code and is never sent to the server, so the server holds only data it can’t read. It keeps that in memory only (a
restart forgets it), drops your entry when you leave or a day after you stop sharing, and ends the team after a week.
Anyone you give the team code to can see your position, so share it only with colleagues on the job.</p>

<h2>Helping improve journey times (only if you turn it on)</h2>
<p>Off unless you turn it on in the Session tab. While you navigate, the phone times each road it drives along and
keeps only the road’s OpenStreetMap ID, the seconds it took, its length, and whether it was night, rush hour or
daytime. The first and last 500 m of every drive are left out. These wait on your phone for at least 6 hours and are
then sent mixed with your other drives, with no position, route, time, callsign or device ID. The server adds them to
totals per road and discards them; a road’s learned speed is used only once at least 5 drives have been timed on it.
Turning it off deletes anything not yet sent.</p>

<h2>Usage counts</h2>
<p>So we know how many crews use BlueRoute, every request to the server carries a random install ID, made on your
phone the first time the app runs, and the app's version number. You can reset the ID in the Session tab, after which
the app counts as a new install. The app also reports how many navigation and pursuit sessions were started and how
many requests got no answer in time, as plain numbers.</p>
<p>The server keeps, for each day: how many different installs it heard from (and on which app versions), how many
routes were planned, how many navigation and pursuit sessions were started, and how many requests timed out or
failed. To count each install once a day, it keeps a scrambled form of the ID (a hash with a random “salt” made for
that day only), and to count it once a week, another (with a salt made for that week only). Neither can be turned back
into the ID, and with a new salt each day and each week, one install can't be linked from one day, or week, to the
next. Within an hour of a day ending, its totals are saved and its scrambled IDs and salt are deleted; the same when a
week ends. Nothing more than a week's worth is ever held. No positions, addresses,
searches, callsigns or IP addresses are kept with these counts, and no third-party analytics service is used.</p>

<h2>Waitlist and emails to us</h2>
<p><strong>Report a problem</strong> in the app opens an email in your own mail app, with the app version and a
summary of the route (length, time, vehicle and how many restrictions it used; no addresses, positions or road names). You can read and change it before you
send it, and nothing is sent unless you do.</p>
<p>If you email us to join the waitlist, we use your email address (and the service or role, if you give it) only to
tell you when BlueRoute is in the App Store and Google Play. It isn't used for marketing or anything else, isn't
shared, and is deleted once we've told you, or sooner if you ask. If you email us for support or about using
BlueRoute in your service, we use your message only to reply.</p>

<h2>Other services</h2>
<ul>
  <li><strong>Map tiles</strong> come from OpenFreeMap. Like any website, it sees your phone’s IP address and which part
    of the map is being shown. The offline map, and the places and roads lists used for search with no signal, are
    downloaded whole from the BlueRoute server, so they say nothing about where you are.</li>
  <li><strong>TfL</strong>: the server reads TfL’s public road closures feed to route around closed roads. Nothing
    about you or your journeys is sent to TfL.</li>
  <li><strong>Ordnance Survey</strong> receives address searches from the server, through its OS Names API (and OS
    Places, only if the server is set up with it): not your position or anything about you. House-number search runs
    on the BlueRoute server itself.</li>
  <li><strong>App updates</strong> come from Expo (expo.dev). When the app opens it asks Expo whether there's a newer
    version, sending the app's version, the phone's platform and a random ID made for update checks, and like any
    website it sees the phone's IP address. Nothing about your location, searches or journeys is sent.</li>
  <li><strong>Open in Google Maps / Waze</strong> hands the destination to that app when you tap it; their own privacy
    policies apply.</li>
</ul>

<h2>Location permission</h2>
<p>The app asks for your location only while you’re using it, to give journey times and directions from where you
are. It doesn’t use location in the background.</p>

<h2>Children</h2>
<p>BlueRoute is meant for emergency-service crews and isn’t directed at children.</p>

<h2>Questions</h2>
<p>To ask about this policy, ${contact(email)}. If this policy changes, the date above changes and the new version is
published here. Using BlueRoute is also subject to its <a href="/terms">terms of use</a>.</p>`,
  );
}

export function supportPage(email?: string): string {
  return page(
    "Support",
    `<p>BlueRoute gives emergency-service crews address and place search filtered to the area they're working, a standard
route and (for emergency-service drivers) a faster blue-light route, sized to their vehicle, turn-by-turn navigation
with spoken directions, and a pursuit screen. Maps and search cover London for now.</p>

<h2>Getting help or reporting a problem</h2>
<p>${contact(email).replace(/^./, (c) => c.toUpperCase())}. Say what you searched for or tapped, what you expected,
and what happened, but please don’t send real addresses from jobs.</p>

<h2>Common questions</h2>
<ul>
  <li><strong>No blue-light route showing?</strong> Blue-light routes are on unless you’ve turned them off in the Session tab.
    One is only shown when it’s meaningfully faster than the standard route.</li>
  <li><strong>Not in London?</strong> Turn on <em>Demo drive</em> in the Session tab to try the app with a simulated
    drive through London.</li>
  <li><strong>Search can’t find a block or estate?</strong> Save it in the Search tab with the road it’s on.</li>
  <li><strong>Team sessions?</strong> Start a team in the Session tab and share the code. You see each other only while
    BlueRoute is open on both phones, and it needs signal. It doesn’t replace your radio or any force system, and it’s
    for you to check it fits your force’s policy.</li>
  <li><strong>Road closures?</strong> Routes avoid roads TfL lists as fully closed, updated every 5 minutes. Lane
    closures, and incidents TfL hasn’t listed yet, aren’t included.</li>
  <li><strong>Where is my log?</strong> On your phone only: open it from the Session tab. It’s never cleared unless you clear it.</li>
</ul>

<p><a href="/terms">Terms of use</a> · <a href="/privacy">Privacy policy</a></p>`,
  );
}

export function termsPage(email?: string): string {
  return page(
    "Terms of use",
    `<p class="muted">BlueRoute · last updated ${UPDATED}</p>

<p>These terms apply to anyone who uses the BlueRoute app or its website. By using BlueRoute you agree to them. If you
don’t agree, don’t use it.</p>

<h2>1. What BlueRoute is, and isn’t</h2>
<ul>
  <li>BlueRoute is an independent navigation aid. It is not made, endorsed, supplied or approved by any police,
    ambulance or fire service, and is not an official system of any of them.</li>
  <li>It is an aid only. It does not replace your training, your judgement, your control room, your radio, your
    service’s systems or your service’s policies.</li>
  <li>It is still being field-tested and may change, stop working or be withdrawn at any time, without notice.</li>
</ul>

<h2>2. You are responsible for how you drive</h2>
<ul>
  <li>You, and the driver, are solely responsible for how the vehicle is driven, for obeying road signs, signals,
    the law and your service’s policies, and for the safety of everyone on and near the road.</li>
  <li>Follow what you see on the road over anything the app shows. Roads, restrictions, closures, speed limits and
    other conditions change, and the app’s information can be missing, out of date or wrong.</li>
  <li>The driver must not operate the app while driving. It is designed for the passenger (operator) to use, or for
    use when the vehicle is stopped safely.</li>
</ul>

<h2>3. Blue-light routes</h2>
<ul>
  <li>Blue-light routes use bus lanes and bus gates and ignore turn restrictions. They are only for drivers of police,
    ambulance, fire and other emergency vehicles who are legally entitled to use those exemptions, are trained to,
    and are using them on an authorised call. Anyone else must turn them off in Session and use the standard route.</li>
  <li>Whether a blue-light route, or any manoeuvre on it, is lawful, safe and appropriate at that moment is your
    decision alone. The app lists the restrictions a route relies on so that you can decide; it never makes that
    decision for you.</li>
  <li>The app tries never to route the wrong way down a one-way street, or under a bridge or limit your chosen vehicle
    can’t take, but it relies on map data that can be wrong. Check the road.</li>
</ul>

<h2>4. Information is provided “as is”</h2>
<ul>
  <li>Addresses, search results, routes, journey times, speed limits, road names, closures, places, custody suites,
    stations and every other piece of information in BlueRoute come from map data and other sources that can be
    incomplete or wrong. They are provided “as is” and “as available”, without any promise that they are accurate,
    complete, current or fit for any purpose.</li>
  <li>Always confirm an address and destination with your control room or by other means before relying on it.</li>
  <li>Speed limits are shown only where the map data has them, and may still be wrong. The posted limit on the road
    always applies.</li>
</ul>

<h2>5. Your notes and your phone</h2>
<ul>
  <li>Anything you type into BlueRoute (notes, saved places, callsign) stays on your phone. You are responsible for
    what you put there and for following your service’s rules on recording and protecting information. Don’t store
    information there that your service says mustn’t be kept on a personal device.</li>
  <li>Keep your phone secure. Anyone who can open it can see your search log and notes.</li>
  <li>Team sessions share your position with anyone who has the team code. Share the code only with colleagues on the
    job, and only where your service’s policy allows it.</li>
</ul>

<h2>6. Your service’s rules</h2>
<p>Using BlueRoute for work may be subject to your service’s approval, its policies on personal devices and apps, and
its rules on outside business interests. Checking and following those is your responsibility.</p>

<h2>7. Liability</h2>
<ul>
  <li>To the fullest extent the law allows, BlueRoute and the people who make it are not liable for any loss, damage,
    injury, delay, penalty, claim or cost arising from using, or not being able to use, BlueRoute or anything it shows,
    including a wrong address, route, journey time, speed limit or restriction.</li>
  <li>Where liability can’t be excluded but can be limited, it is limited to the amount you paid for BlueRoute (nothing,
    if you paid nothing).</li>
  <li>Nothing in these terms excludes or limits liability for death or personal injury caused by negligence, for fraud,
    or for anything else that the law does not allow to be excluded or limited, or affects your statutory rights.</li>
</ul>

<h2>8. Using BlueRoute properly</h2>
<p>Don’t misuse BlueRoute: don’t use it to break the law, to impersonate an emergency service, to interfere with the
service or its server, or to collect other people’s information. We may stop providing BlueRoute to anyone who does.</p>

<h2>9. Other services</h2>
<p>Map data © OpenStreetMap contributors, and data from Ordnance Survey, TfL and others, each under their own terms.
“Open in Google Maps” and “Open in Waze” hand over to those apps, whose own terms apply.</p>

<h2>10. Changes and law</h2>
<ul>
  <li>These terms may change. The date above changes when they do, and using BlueRoute after a change means you accept
    the new terms.</li>
  <li>These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction,
    except where the law where you live gives you the right to use your local courts.</li>
  <li>If any part of these terms can’t be enforced, the rest still applies.</li>
</ul>

<h2>Questions</h2>
<p>To ask about these terms, ${contact(email)}. How BlueRoute handles data is in the <a href="/privacy">privacy policy</a>.</p>`,
  );
}
