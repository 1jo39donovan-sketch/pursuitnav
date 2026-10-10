// Where the officer is along the chosen route, and what's next. Pure
// functions over the route from the server and the latest GPS fix.
import type { Maneuver, Route } from "../api/routes";

type LngLat = [number, number];

/** Distance from the route beyond which a fix counts as off route. */
export const OFF_ROUTE_M = 40;
/** Consecutive off-route fixes (about a second each) before re-routing. */
export const OFF_ROUTE_FIXES = 4;
/** Within this of the end, the officer has arrived. */
export const ARRIVED_M = 30;

export interface PreparedRoute {
  route: Route;
  /** Running distance along the shape to each point, metres. */
  cumulative: number[];
}

export interface Progress {
  /** Index of the shape segment the officer is on (shape[i] → shape[i+1]). */
  segment: number;
  /** Metres from the start of the route to the officer's snapped position. */
  along: number;
  /** Metres from the route line. */
  offRouteBy: number;
  /** The manoeuvre being driven now (its road), and the next one to make. */
  current: Maneuver;
  next: Maneuver | null;
  /** The one after next, for "then …". */
  after: Maneuver | null;
  distanceToNextM: number;
  remainingM: number;
  remainingS: number;
  arrived: boolean;
}

const EARTH_M_PER_DEG = 111320;

/** Local flat projection around a latitude: good to centimetres over a few km. */
function project([lng, lat]: LngLat, cosLat: number): [number, number] {
  return [lng * EARTH_M_PER_DEG * cosLat, lat * EARTH_M_PER_DEG];
}

export function prepare(route: Route): PreparedRoute {
  const cosLat = Math.cos(((route.shape[0]?.[1] ?? 51.5) * Math.PI) / 180);
  const cumulative = [0];
  for (let i = 1; i < route.shape.length; i++) {
    const [ax, ay] = project(route.shape[i - 1] as LngLat, cosLat);
    const [bx, by] = project(route.shape[i] as LngLat, cosLat);
    cumulative.push(cumulative[i - 1]! + Math.hypot(bx - ax, by - ay));
  }
  return { route, cumulative };
}

/**
 * Snaps a position to the route. Searches from a little behind the last
 * known segment so a road running back past itself (a U-shaped route)
 * doesn't snap the officer to the wrong leg.
 */
export function snap(
  prepared: PreparedRoute,
  position: { lat: number; lng: number },
  lastSegment = 0,
): { segment: number; along: number; distance: number } {
  const { shape } = prepared.route;
  const cosLat = Math.cos((position.lat * Math.PI) / 180);
  const [px, py] = project([position.lng, position.lat], cosLat);
  let best = { segment: 0, along: 0, distance: Infinity };
  const from = Math.max(0, lastSegment - 3);
  for (let i = from; i < shape.length - 1; i++) {
    const [ax, ay] = project(shape[i] as LngLat, cosLat);
    const [bx, by] = project(shape[i + 1] as LngLat, cosLat);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    // Prefer the earliest close match: ties go to the leg the officer reaches first.
    if (d < best.distance - 1) {
      best = { segment: i, along: prepared.cumulative[i]! + t * Math.sqrt(len2), distance: d };
    }
  }
  return best;
}

export function progressAt(
  prepared: PreparedRoute,
  position: { lat: number; lng: number },
  lastSegment = 0,
): Progress {
  const { route, cumulative } = prepared;
  const total = cumulative[cumulative.length - 1] ?? 0;
  const { segment, along, distance } = snap(prepared, position, lastSegment);

  // The manoeuvre being driven is the last one starting at or before here.
  const ms = route.maneuvers;
  let idx = 0;
  for (let i = 0; i < ms.length; i++) if (ms[i]!.beginShapeIndex <= segment) idx = i;
  const current = ms[idx]!;
  const next = ms[idx + 1] ?? null;
  const after = ms[idx + 2] ?? null;
  const nextAt = next ? cumulative[next.beginShapeIndex]! : total;

  // Time left: the rest of this manoeuvre pro rata, plus every later one.
  const curStart = cumulative[current.beginShapeIndex]!;
  const curLen = Math.max(1, nextAt - curStart);
  const curLeft = Math.max(0, Math.min(1, (nextAt - along) / curLen));
  const remainingS = current.timeS * curLeft + ms.slice(idx + 1).reduce((s, m) => s + m.timeS, 0);

  const remainingM = Math.max(0, total - along);
  return {
    segment,
    along,
    offRouteBy: distance,
    current,
    next,
    after,
    distanceToNextM: Math.max(0, nextAt - along),
    remainingM,
    remainingS,
    arrived: remainingM < ARRIVED_M,
  };
}

/**
 * Counts consecutive off-route fixes. GPS can be poor between tall
 * buildings, so the threshold widens with the fix's own stated accuracy.
 */
export function offRouteCount(previous: number, offRouteBy: number, accuracy: number | null): number {
  const limit = Math.max(OFF_ROUTE_M, (accuracy ?? 0) * 1.5);
  return offRouteBy > limit ? previous + 1 : 0;
}

/** Arrow for a Valhalla maneuver type, for the big next-turn display. */
export function maneuverArrow(type: number): string {
  switch (type) {
    case 9: // slight right
    case 23: // keep right
    case 18: // ramp right
    case 20: // exit right
    case 37: // merge right
      return "↗";
    case 10: // right
    case 2: // start right
      return "→";
    case 11: // sharp right
      return "↘";
    case 12: // U-turn right
    case 13: // U-turn left
      return "↶";
    case 14: // sharp left
      return "↙";
    case 15: // left
    case 3: // start left
      return "←";
    case 16: // slight left
    case 24: // keep left
    case 19: // ramp left
    case 21: // exit left
    case 38: // merge left
      return "↖";
    case 26: // enter roundabout
    case 27: // exit roundabout
      return "⟳";
    case 4: // destination
    case 5:
    case 6:
      return "⚑";
    default:
      return "↑";
  }
}
