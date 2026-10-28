// What the pursuit screen shows from the server (road, limit, next junction),
// and when to say the connection is the problem. Pure, so it can be tested.
import type { PursuitInfo, PursuitLookup } from "../api/pursuit";

/** An answer older than this isn't shown: the car has moved on. Never a guess. */
export const STALE_MS = 10_000;

export interface PursuitFeed {
  info: PursuitInfo | null;
  /** When the last answer arrived, ms since 1970 (0: never). */
  okAt: number;
  /** Why the last request failed, when it was the connection: the network, or no answer in time. */
  trouble: "no-signal" | "no-answer" | null;
  /** Whether any answer (or failure) has come back yet. */
  asked?: boolean;
  /** A different road from one answer only, waiting for the next to agree before it's shown. */
  pending?: PursuitInfo | null;
}

export const EMPTY_FEED: PursuitFeed = { info: null, okAt: 0, trouble: null };

/**
 * A single answer that loses the road (GPS drifted off it for a second) keeps
 * what was showing, for up to this long. Not a guess: it's the road the car
 * was matched to a moment ago, and the limit signed on it.
 */
export const HOLD_MS = 4_000;

export function nextFeed(feed: PursuitFeed, lookup: PursuitLookup, now: number): PursuitFeed {
  if (lookup.status === "ok") return { ...steadied(feed, lookup.info, now), asked: true };
  const trouble = lookup.status === "no-signal" || lookup.status === "no-answer" ? lookup.status : null;
  return { ...feed, trouble, asked: true };
}

/**
 * GPS a few metres off the road snaps to a side road, or to none, for one
 * answer at a time: the screen flickered between the road and "—" or a side
 * street. A new road is shown once two answers in a row agree; one answer with
 * no road keeps the road (and its junction) for a few seconds.
 */
function steadied(feed: PursuitFeed, info: PursuitInfo, now: number): PursuitFeed {
  const cur = feed.info;
  const recent = cur != null && now - feed.okAt <= HOLD_MS;
  if (!cur?.road || !recent) return { info, okAt: now, trouble: null, pending: null };
  if (info.road == null) {
    // Lost the road for one answer: keep it, with the newer house number if there is one.
    return { ...feed, info: { ...cur, near: info.near ?? cur.near }, trouble: null };
  }
  if (info.road === cur.road) {
    // Same road: a junction that vanished for one answer stays, unless it was just reached.
    const junction =
      info.nextJunction ?? (cur.nextJunction && cur.nextJunction.distanceM > 25 ? cur.nextJunction : null);
    return { info: { ...info, nextJunction: junction }, okAt: now, trouble: null, pending: null };
  }
  // Another road: shown once the next answer agrees.
  if (feed.pending?.road === info.road) return { info, okAt: now, trouble: null, pending: null };
  return { ...feed, info: { ...cur, near: info.near ?? cur.near }, okAt: now, trouble: null, pending: info };
}

/** The server's answer if it's recent enough to show; null otherwise (shown as "—"). */
export function shownInfo(feed: PursuitFeed, now: number): PursuitInfo | null {
  return feed.info && now - feed.okAt <= STALE_MS ? feed.info : null;
}

export interface FeedNote {
  /** A banner title when the connection is the problem ("NO SIGNAL", "NO ANSWER"); else a plain note. */
  title: string | null;
  text: string;
}

/** The line under the readouts, if one's needed. "No signal" only when the network itself failed. */
export function feedNote(feed: PursuitFeed, now: number): FeedNote | null {
  const shown = shownInfo(feed, now);
  const then = shown
    ? "road, limit and junction may be out of date."
    : "road, limit and junction show “—” until it’s back.";
  if (feed.trouble === "no-signal") return { title: "NO SIGNAL", text: `No connection: ${then}` };
  if (feed.trouble === "no-answer") return { title: "NO ANSWER", text: `The server isn’t answering: ${then}` };
  // Just opened: the first answer is on its way.
  if (!shown && !feed.asked) return { title: null, text: "Finding the road…" };
  if (!shown) {
    return { title: null, text: "Road, limit and junction need the BlueRoute server. Showing “—” until it answers." };
  }
  return null;
}
