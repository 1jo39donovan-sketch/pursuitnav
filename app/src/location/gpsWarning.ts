// When to warn that the GPS position is poor. A single loose reading (under
// a bridge, between tall buildings) shouldn't flash a banner over the map:
// it shows after SHOW_AFTER_MS of poor readings, and once up, stays until
// HIDE_AFTER_MS of good ones, so it doesn't flicker either (PM, item 5).
import type { Fix } from "./LocationProvider";

export const SHOW_AFTER_MS = 5000;
export const HIDE_AFTER_MS = 3000;
/** Poorer than this is worth a warning while looking around; on a route the line is 100 m. */
export const WARN_OVER_M = 50;
export const WARN_OVER_ON_ROUTE_M = 100;

/** Whether the warning is up, from recent fixes (oldest first). Unknown accuracy counts as poor. */
export function gpsWarning(fixes: readonly Fix[], limitM: number): boolean {
  let shown = false;
  let badSince: number | null = null;
  let goodSince: number | null = null;
  for (const f of fixes) {
    if (f.accuracy == null || f.accuracy > limitM) {
      goodSince = null;
      badSince ??= f.timestamp;
      if (f.timestamp - badSince >= SHOW_AFTER_MS) shown = true;
    } else {
      badSince = null;
      goodSince ??= f.timestamp;
      if (shown && f.timestamp - goodSince >= HIDE_AFTER_MS) shown = false;
    }
  }
  return shown;
}
