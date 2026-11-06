// Day or night where the crew is, from the sun's height (the standard
// approximation, good to a minute or two), so the screens and map can turn
// light at sunrise and dark at sunset by themselves. No network needed.

const RAD = Math.PI / 180;
/** The sun's centre this far below the horizon is sunrise or sunset (refraction and its radius). */
const HORIZON = -0.833;

/** The sun's height above the horizon in degrees, at a time and place. */
export function sunAltitude(date: Date, lat: number, lng: number): number {
  const d = date.getTime() / 86_400_000 - 10_957.5; // days since 1 Jan 2000, 12:00 UTC
  const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD; // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24; // hours
  const ha = (gmst * 15 + lng) * RAD - ra; // hour angle
  const phi = lat * RAD;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha)) / RAD;
}

/** Whether the sun is up. */
export function isDaylight(date: Date, lat: number, lng: number): boolean {
  return sunAltitude(date, lat, lng) > HORIZON;
}
