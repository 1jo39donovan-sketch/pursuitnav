import type { Fix } from "../location/LocationProvider";

// A scripted patrol from Holloway Road to Whitechapel, the same drive the
// clickable prototype used. Points are [lng, lat] along the real roads.
const ROUTE: [number, number][] = [
  [-0.117, 51.556], // Holloway Road, Seven Sisters Road junction
  [-0.1128, 51.5527],
  [-0.1078, 51.549],
  [-0.1037, 51.5463], // Highbury Corner
  [-0.1027, 51.5418], // Upper Street, Town Hall
  [-0.1032, 51.5362], // Islington Green
  [-0.1057, 51.5323], // Angel
  [-0.099, 51.531], // City Road
  [-0.0935, 51.5285],
  [-0.0877, 51.5257], // Old Street roundabout
  [-0.082, 51.526], // Old Street
  [-0.0778, 51.5263], // Shoreditch High Street
  [-0.0745, 51.5225], // Commercial Street
  [-0.073, 51.5185],
  [-0.072, 51.5155], // Whitechapel High Street
  [-0.065, 51.517], // Whitechapel Road
  [-0.06, 51.5195],
  [-0.0555, 51.5212], // Cambridge Heath Road
];

const EARTH_RADIUS_M = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function distanceM(a: [number, number], b: [number, number]): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
    Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const legs = ROUTE.slice(1).map((to, i) => ({ from: ROUTE[i], to, length: distanceM(ROUTE[i], to) }));
const totalM = legs.reduce((sum, leg) => sum + leg.length, 0);

/** Speed in m/s at a point along the drive: urban traffic, 20–40 mph. */
function speedAt(elapsedS: number): number {
  return 13 + 4 * Math.sin(elapsedS / 9);
}

/** Where the demo car is after `elapsedS` seconds. Loops back to the start. */
export function demoFixAt(elapsedS: number, now = Date.now()): Fix {
  // Average speed is 13 m/s, so distance travelled is close enough to
  // speed × time; the sine term only wobbles the speedometer.
  let along = (13 * elapsedS) % totalM;
  for (const leg of legs) {
    if (along <= leg.length) {
      const t = leg.length === 0 ? 0 : along / leg.length;
      return {
        lng: leg.from[0] + (leg.to[0] - leg.from[0]) * t,
        lat: leg.from[1] + (leg.to[1] - leg.from[1]) * t,
        accuracy: 6,
        speed: speedAt(elapsedS),
        course: bearingDeg(leg.from, leg.to),
        timestamp: now,
      };
    }
    along -= leg.length;
  }
  const last = ROUTE[ROUTE.length - 1];
  return { lng: last[0], lat: last[1], accuracy: 6, speed: 0, course: null, timestamp: now };
}
