// What the pursuit screen shows from the server (road, limit, next junction),
// and when to say there's no signal. Pure, so it can be tested.
import type { PursuitInfo, PursuitLookup } from "../api/pursuit";

/** An answer older than this isn't shown: the car has moved on. Never a guess. */
export const STALE_MS = 10_000;

export interface PursuitFeed {
  info: PursuitInfo | null;
  /** When the last answer arrived, ms since 1970 (0: never). */
  okAt: number;
  /** The last request got no answer in time. */
  noSignal: boolean;
}

export const EMPTY_FEED: PursuitFeed = { info: null, okAt: 0, noSignal: false };

export function nextFeed(feed: PursuitFeed, lookup: PursuitLookup, now: number): PursuitFeed {
  if (lookup.status === "ok") return { info: lookup.info, okAt: now, noSignal: false };
  return { ...feed, noSignal: lookup.status === "no-signal" };
}

/** The server's answer if it's recent enough to show; null otherwise (shown as "—"). */
export function shownInfo(feed: PursuitFeed, now: number): PursuitInfo | null {
  return feed.info && now - feed.okAt <= STALE_MS ? feed.info : null;
}

/** The line under the readouts, if one's needed. */
export function feedNote(feed: PursuitFeed, now: number): { text: string; noSignal: boolean } | null {
  const shown = shownInfo(feed, now);
  if (feed.noSignal) {
    return {
      noSignal: true,
      text: shown
        ? "No signal: road, limit and junction may be out of date."
        : "No signal: road, limit and junction show “—” until it’s back.",
    };
  }
  if (!shown)
    return {
      noSignal: false,
      text: "Road, limit and junction need the Blue Route server. Showing “—” until it answers.",
    };
  return null;
}
