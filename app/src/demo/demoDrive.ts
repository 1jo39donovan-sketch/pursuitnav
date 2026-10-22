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

type Leg = { from: [number, number]; to: [number, number]; length: number };
interface Drive {
  legs: Leg[];
  totalM: number;
  /** The patrol goes round again; a route stops at its end. */
  loop: boolean;
}

function driveAlong(path: [number, number][], loop: boolean): Drive {
  const legs = path.slice(1).map((to, i) => ({ from: path[i], to, length: distanceM(path[i], to) }));
  return { legs, totalM: legs.reduce((sum, leg) => sum + leg.length, 0), loop };
}

const PATROL = driveAlong(ROUTE, true);

// Under the 20 mph limit on most of these roads (and every borough road in
// Islington and Hackney): a demo that speeds would show officers breaking
// the limit. Between 16 and 19.7 mph.
const AVERAGE_MS = 8;

/** Speed in m/s at a point along the drive, wobbling a little like traffic. */
function speedAt(elapsedS: number): number {
  return AVERAGE_MS + 0.8 * Math.sin(elapsedS / 9);
}

/** Where the demo car is after `elapsedS` seconds on a drive (the patrol unless given). */
export function demoFixAt(elapsedS: number, now = Date.now(), drive: Drive = PATROL): Fix {
  // Distance travelled is close enough to the average speed × time; the
  // sine term only wobbles the speedometer.
  const travelled = AVERAGE_MS * elapsedS;
  if (!drive.loop && travelled >= drive.totalM) return parkedAtEnd(drive, now);
  let along = drive.totalM > 0 ? travelled % drive.totalM : 0;
  for (const leg of drive.legs) {
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
  return parkedAtEnd(drive, now);
}

function parkedAtEnd(drive: Drive, now: number): Fix {
  const last = drive.legs.length ? drive.legs[drive.legs.length - 1] : null;
  const end = last?.to ?? ROUTE[0];
  return {
    lng: end[0],
    lat: end[1],
    accuracy: 6,
    speed: 0,
    course: last ? bearingDeg(last.from, last.to) : null,
    timestamp: now,
  };
}

// The drive the demo car is on now, and when it started. Navigating puts
// the car on the route from its first point, so a demo starts on the route
// rather than wherever the patrol had got to.
let current: { drive: Drive; startedAt: number } | null = null;

/** Drives the demo car along `path` ([lng, lat]) from its start, or back on patrol with null. */
export function setDemoPath(path: readonly (readonly [number, number])[] | null, now = Date.now()): void {
  current = {
    drive: path && path.length > 1 ? driveAlong(path.map((p) => [p[0], p[1]]), false) : PATROL,
    startedAt: now,
  };
}

/** The demo car's position now. */
export function demoFixNow(now = Date.now()): Fix {
  current ??= { drive: PATROL, startedAt: now };
  return demoFixAt((now - current.startedAt) / 1000, now, current.drive);
}

/** When the demo car was last put on a new drive, ms since 1970 (0 if never). */
export function demoDriveStartedAt(): number {
  return current?.startedAt ?? 0;
}
