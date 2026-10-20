// Opt-in learning, on the phone: how long each road on the route actually
// took. Only "way, seconds, metres, time band" is ever kept or sent: never a
// position, a time, or the route. See docs/ROADMAP.md for the rules.

export type Band = "night" | "peak" | "day";

export interface Sample {
  /** OpenStreetMap way ID */
  w: number;
  s: number;
  m: number;
  b: Band;
}

export interface RouteWay {
  wayId: number;
  beginShapeIndex: number;
  endShapeIndex: number;
}

/** Where along the route the vehicle was, and when (ms since 1970). */
export interface Observation {
  along: number;
  at: number;
}

// The first and last 500 m of a drive are never used: they'd point at
// stations, homes and incident addresses.
export const TRIM_M = 500;
// Shorter stretches are mostly junction; their times say little about the road.
const MIN_LENGTH_M = 50;
// A gap in fixes longer than this (tunnel, app in the background) spoils the timing.
const MAX_GAP_MS = 20_000;

/** Weekday rush hours, night, and the rest. */
export function bandAt(ms: number): Band {
  const d = new Date(ms);
  const h = d.getHours();
  if (h >= 22 || h < 6) return "night";
  const weekday = d.getDay() >= 1 && d.getDay() <= 5;
  if (weekday && ((h >= 7 && h < 10) || (h >= 16 && h < 19))) return "peak";
  return "day";
}

/**
 * Time taken on each way the vehicle drove the whole of, from observations of
 * its progress along one route (in order, on route throughout).
 */
export function wayTimes(ways: RouteWay[], cumulative: number[], observations: Observation[]): Sample[] {
  const total = cumulative[cumulative.length - 1] ?? 0;
  if (observations.length < 2) return [];
  // Trimmed from the route's ends and from where the drive really started and
  // stopped (navigation ended early, or began after a re-route).
  const from = Math.max(0, observations[0]!.along) + TRIM_M;
  const to = Math.min(total, observations[observations.length - 1]!.along) - TRIM_M;
  const samples: Sample[] = [];
  for (const way of ways) {
    const begin = cumulative[way.beginShapeIndex];
    const end = cumulative[way.endShapeIndex];
    if (begin === undefined || end === undefined) continue;
    const m = end - begin;
    if (m < MIN_LENGTH_M || begin < from || end > to) continue;
    const enter = timeAt(observations, begin);
    const leave = timeAt(observations, end);
    if (enter === null || leave === null || leave <= enter) continue;
    if (gapBetween(observations, enter, leave)) continue;
    samples.push({ w: way.wayId, s: Math.round((leave - enter) / 100) / 10, m: Math.round(m), b: bandAt(enter) });
  }
  return samples;
}

/** True if fixes stopped for too long at some point between the two times. */
function gapBetween(obs: Observation[], from: number, to: number): boolean {
  return obs.some((b, i) => i > 0 && b.at > from && obs[i - 1]!.at < to && b.at - obs[i - 1]!.at > MAX_GAP_MS);
}

/** When the vehicle passed `along`, between the observations either side; null if not seen both sides. */
function timeAt(obs: Observation[], along: number): number | null {
  for (let i = 1; i < obs.length; i++) {
    const a = obs[i - 1]!;
    const b = obs[i]!;
    if (a.along <= along && b.along >= along) {
      if (b.at - a.at > MAX_GAP_MS) return null;
      if (b.along === a.along) return a.at;
      return a.at + ((b.at - a.at) * (along - a.along)) / (b.along - a.along);
    }
  }
  return null;
}
