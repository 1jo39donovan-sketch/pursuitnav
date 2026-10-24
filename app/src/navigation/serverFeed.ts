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
}

export const EMPTY_FEED: PursuitFeed = { info: null, okAt: 0, trouble: null };

export function nextFeed(feed: PursuitFeed, lookup: PursuitLookup, now: number): PursuitFeed {
  if (lookup.status === "ok") return { info: lookup.info, okAt: now, trouble: null };
  const trouble = lookup.status === "no-signal" || lookup.status === "no-answer" ? lookup.status : null;
  return { ...feed, trouble };
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
  if (!shown) {
    return { title: null, text: "Road, limit and junction need the BlueRoute server. Showing “—” until it answers." };
  }
  return null;
}
