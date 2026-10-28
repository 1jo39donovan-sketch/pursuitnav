# Team sharing: when, where and battery

How a phone in a team session decides whether to share its position. Written 28 October 2026 for the PM's advanced UX brief. Code: `app/src/team/sharePolicy.ts` (the rules, tested) and `app/src/team/TeamProvider.tsx` (sending).

## The crew's choice (Session → Team → Share my position)

| Choice | Shares when | Default |
|---|---|---|
| **Always** | BlueRoute is open | ✅ |
| **Navigating** | navigating to a job (or following a colleague in) | |
| **On scene** | within 150 m of the place last navigated to, during or after navigating | |

**Battery saver** (a switch): shares only while navigating, whatever the choice, and once a minute when standing still.

Whatever the choice, a box at the top of the Team section says plainly what's happening: "Sharing while BlueRoute is open", "Not sharing: you're at a police station", and so on. When a phone isn't sharing, Session's Team summary also says "you're hidden".

## Locked phone or app in the background: fails closed

BlueRoute has **no background location**. A locked phone, or another app in front, shares nothing. Colleagues see the last share age out ("Updated 6 min ago", in amber after 5 minutes).

This applies to all three choices. "Always" means "always while BlueRoute is open". Sharing in the background would need:
- a new native build, with `expo-location` background updates, `expo-task-manager` and an Android foreground service (a notification while it runs);
- Apple's background-location justification at review;
- Google Play's background-location declaration and review (including a video);
- Intune policies, which can block it on force phones.

It's deferred until the store accounts exist and Josh decides it's worth those reviews.

## Police Location (hidden by default)

- **Source:** OpenStreetMap `amenity=police` (public; ODbL), from the weekly places list the app already downloads. No private or non-public sites are used.
- **Shape:** a 75 m radius around each station's mapped point, rather than building outlines: points are what the places list carries, and 75 m covers a station and its yard.
- **Hysteresis:**
  - hidden from 75 m;
  - shown again only beyond 120 m, on a fix better than ±50 m;
  - with no fix (no signal inside), it stays hidden.
- **While hidden:**
  - the phone sends a share with **no position**, so it drops off colleagues' maps and team lists (older app versions too);
  - the drive there is deleted, so following it in can't lead to the station.
- **Override:** "Share at police stations" on Session → Team, off by default.

## Battery

- **Standing still** (moved less than 25 m): a share at most once a minute, instead of every 15 s.
- **Not sharing:** one "hidden" share when it stops, then one a minute to stay in the team.
- **Reading colleagues' positions** stays at every 15 s. It's a small request and doesn't use GPS.
- GPS itself runs only while BlueRoute is open, as before; there's no extra high-rate GPS for team sharing.

Rough expected impact, not measured on a device yet:

| Use | Impact |
|---|---|
| Screen-on navigation | The big cost is the screen and GPS, not team sharing. |
| "Always", standing still | One small request a minute, on top of the open app. |
| "Navigating only" or battery saver | Nothing extra outside navigation. |

## Elevation (deferred)

Not shipped.
- **GPS height is too rough for flats.** It's ±10–30 m, which is 3 to 10 floors, so it can't say which floor someone is on, and showing it would mislead.
- **No barometer in the browser.** Safari (the web app) gives no barometric altitude. The phone app would need a new native module, so a new build and store review, for a figure that still couldn't give a floor.
- **What helps instead:** the block notes (floor, entrance, flats), routing to the mapped entrance, and the colleague card's GPS accuracy.

## Retest on a drive (two phones)

1. Both phones on "Always": each sees the other, and the "Sharing…" box is green.
2. One phone on "Navigating": it drops off the other's map until it starts navigating.
3. Walk into a police station car park: the phone drops off within about 15 s, and the box says "Not sharing: you're at a police station". Walk 150 m away: it comes back.
4. Lock one phone for 6 minutes: the other shows it as last updated 6 min ago, in amber.
