// The privacy policy and support pages the app stores ask for. Plain HTML,
// served by the API so they live at the same address as the server.

const ISSUES_URL = "https://github.com/1jo39donovan-sketch/pursuitnav/issues";
const UPDATED = "10 October 2026";

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function contact(email: string | undefined): string {
  return email
    ? `email <a href="mailto:${escape(email)}">${escape(email)}</a>`
    : `open an issue at <a href="${ISSUES_URL}">${ISSUES_URL}</a> (don’t include addresses or anything identifying)`;
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Blue Route</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0c1220; color: #e6ebf5; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 42rem; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { color: #f5b301; font-size: 1.8rem; margin: 0 0 4px; }
  h2 { font-size: 1.15rem; margin: 28px 0 6px; }
  a { color: #f5b301; }
  .muted { color: #8a96ad; font-size: 0.9rem; }
  li { margin: 4px 0; }
</style>
</head>
<body><main>
<h1>${title}</h1>
${body}
</main></body>
</html>`;
}

export function privacyPage(email?: string): string {
  return page(
    "Privacy policy",
    `<p class="muted">Blue Route · last updated ${UPDATED}</p>

<p>Blue Route is a navigation app for police officers on patrol in London. It’s an independent app, not a police force
system. It has no accounts, no adverts, no analytics and no tracking.</p>

<h2>Kept on your phone only</h2>
<ul>
  <li>Your callsign, the boroughs you pick, and your settings.</li>
  <li>Blocks and estates you save.</li>
  <li>The log of your searches and the routes you picked.</li>
</ul>
<p>None of this is sent anywhere. It stays until you clear the log in the app or uninstall it.</p>

<h2>Sent to the Blue Route server, and not kept</h2>
<p>To answer a request the app sends the Blue Route server only what that request needs:</p>
<ul>
  <li><strong>Routes:</strong> your current position (and direction of travel, when moving) and the destination’s
    position.</li>
  <li><strong>Address search:</strong> the address you typed. The server passes it to Ordnance Survey’s OS Places API
    to look it up.</li>
  <li><strong>Pursuit mode:</strong> your last few positions and direction of travel, to find the road and its speed
    limit.</li>
</ul>
<p>The server works out the answer in memory and keeps nothing: it doesn’t log requests, positions or addresses, and
has no database of users. Connections use HTTPS.</p>

<h2>Other services</h2>
<ul>
  <li><strong>Map tiles</strong> come from OpenFreeMap. Like any website, it sees your phone’s IP address and which part
    of the map is being shown.</li>
  <li><strong>Ordnance Survey</strong> receives address searches from the server (not your position or anything about
    you).</li>
  <li><strong>Open in Google Maps / Waze</strong> hands the destination to that app when you tap it; their own privacy
    policies apply.</li>
</ul>

<h2>Location permission</h2>
<p>The app asks for your location only while you’re using it, to give journey times and directions from where you
are. It doesn’t use location in the background.</p>

<h2>Children</h2>
<p>Blue Route is meant for police officers and isn’t directed at children.</p>

<h2>Questions</h2>
<p>To ask about this policy, ${contact(email)}. If this policy changes, the date above changes and the new version is
published here.</p>`,
  );
}

export function supportPage(email?: string): string {
  return page(
    "Support",
    `<p>Blue Route gives officers on patrol in London address and place search filtered to their boroughs, a standard
route and (for police drivers) a faster police route, turn-by-turn navigation, and a pursuit screen.</p>

<h2>Getting help or reporting a problem</h2>
<p>${contact(email).replace(/^./, (c) => c.toUpperCase())}. Say what you searched for or tapped, what you expected,
and what happened, but please don’t send real addresses from jobs.</p>

<h2>Common questions</h2>
<ul>
  <li><strong>No police route showing?</strong> Police routes are off until you turn them on in the Session tab and
    confirm you’re a police driver. Even then, one is only shown when it’s meaningfully faster.</li>
  <li><strong>Not in London?</strong> Turn on <em>Demo drive</em> in the Session tab to try the app with a simulated
    drive through London.</li>
  <li><strong>Search can’t find a block or estate?</strong> Save it in the Search tab with the road it’s on.</li>
  <li><strong>Where is my log?</strong> On your phone only, in the Log tab. It’s never cleared unless you clear it.</li>
</ul>

<p><a href="/privacy">Privacy policy</a></p>`,
  );
}
