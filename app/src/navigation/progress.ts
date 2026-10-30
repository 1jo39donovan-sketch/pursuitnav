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
  /** Metres from the snapped position to the nearest turn (the next one, or the one just made). */
  nearTurnM: number;
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
    nearTurnM: Math.min(Math.max(0, nextAt - along), Math.max(0, along - curStart)),
    remainingM,
    remainingS,
    arrived: remainingM < ARRIVED_M,
  };
}

/**
 * Counts consecutive off-route fixes. GPS can be poor between tall
 * buildings, so the threshold widens with the fix's own stated accuracy.
 */
/** Off the line by this much and driving across the route's direction: a missed turn, counted double. */
export const WRONG_WAY_M = 20;
/** Degrees between the car's course and the route's direction that count as across it. */
export const WRONG_WAY_DEG = 60;

/** Snapped within this of a turn counts as at the turn. */
export const AT_TURN_M = 12;
/** Off the line at a turn by this much: driven past it (a London road is about 10 m wide). */
export const PAST_TURN_M = 12;
/** Off the line at a turn by this much: certainly past it, re-route at once. */
export const WELL_PAST_TURN_M = 20;

/**
 * Off-route fixes so far. A car well off the line counts one a fix (4 to
 * re-route, about 4 s). A missed turn shows sooner, because on the 30 Oct
 * drives, crawling in traffic, "Now" stayed up 5–8 s past each turn:
 * - snapped to a turn and 15 m off the line (driven on past it): two a fix,
 *   and 20 m off re-routes at once;
 * - a little off the line and driving across the route's direction: two a fix.
 * `headingOff` is degrees between the car's course and the route's direction
 * there (null when too slow to have a course); `nearTurnM` is how far the
 * snapped position is from the nearest turn.
 */
export function offRouteCount(
  previous: number,
  offRouteBy: number,
  accuracy: number | null,
  headingOff: number | null = null,
  nearTurnM = Infinity,
): number {
  const acc = accuracy ?? 0;
  if (nearTurnM <= AT_TURN_M) {
    if (offRouteBy > Math.max(WELL_PAST_TURN_M, acc * 1.5)) return Math.max(previous + 2, OFF_ROUTE_FIXES);
    if (offRouteBy > Math.max(PAST_TURN_M, acc * 1.2)) return previous + 2;
  }
  const wrongWay = headingOff != null && headingOff > WRONG_WAY_DEG && offRouteBy > Math.max(WRONG_WAY_M, acc);
  if (wrongWay) return previous + 2;
  const limit = Math.max(OFF_ROUTE_M, acc * 1.5);
  return offRouteBy > limit ? previous + 1 : 0;
}

/** Degrees between two courses, 0 to 180. */
export function courseDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
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

/** Valhalla's arrival manoeuvres: destination ahead, on the right, on the left. */
const ARRIVAL: Record<number, string> = {
  4: "Destination ahead",
  5: "Destination ahead on the right",
  6: "Destination ahead on the left",
};

/**
 * What to show and say for the next manoeuvre. Valhalla words the arrival
 * as "You have arrived…", which reads wrong while it's still ahead.
 */
export function upcomingInstruction(m: Maneuver): string {
  return ARRIVAL[m.type] ?? m.instruction;
}

/**
 * An instruction for reading at a glance: without the routing engine's
 * trailing "Continue on A501." (or "Continue for 200 metres."), which pushed
 * the turn itself out of the "Then" line.
 */
export function briefInstruction(text: string): string {
  const brief = text
    .replace(/\s+Continue (on|for|along)\b[^.]*\.?\s*$/i, "")
    // "A203/South Lambeth Road": the name is what's on the street sign.
    .replace(new RegExp(String.raw`\b${ROAD_REF}/(?=[A-Z][a-z])`, "g"), "")
    .replace(new RegExp(String.raw`([a-z])/${ROAD_REF}\b`, "g"), "$1")
    .trim();
  return brief || text;
}

const ROAD_REF = String.raw`[ABM]\d{1,4}(?:\(M\))?`;

/**
 * The "Then" line: the road's name (its number if it has none), shown after
 * the turn's arrow, so it fits on one line ("Then → Wandsworth Road") rather
 * than "Then → Turn right onto Wandsworth Road/A30…". The full instruction for
 * an arrival or a turn with no road named.
 */
export function thenText(m: Maneuver, full: string): string {
  if (m.type in ARRIVAL || !m.streetNames.length) return briefInstruction(full);
  const parts = m.streetNames.flatMap((n) => n.split("/").map((p) => p.trim())).filter(Boolean);
  const ref = new RegExp(`^${ROAD_REF}$`);
  return parts.find((p) => !ref.test(p)) ?? parts[0] ?? briefInstruction(full);
}

/**
 * The turns after the next two (those are on screen already), with how far
 * each is from here: for reading ahead where there's room (landscape).
 */
export function comingUp(prepared: PreparedRoute, progress: Progress, count = 5): { maneuver: Maneuver; inM: number }[] {
  const ms = prepared.route.maneuvers;
  const from = progress.after ?? progress.next;
  if (!from) return [];
  const start = ms.indexOf(from) + 1;
  if (start <= 0) return [];
  return ms.slice(start, start + count).map((m) => ({
    maneuver: m,
    inM: Math.max(0, (prepared.cumulative[m.beginShapeIndex] ?? 0) - progress.along),
  }));
}

/**
 * The point `along` metres down the route, and which way the road runs there:
 * where the vehicle is drawn while it's on the route, so the arrow sits on the
 * road rather than wherever GPS drift puts it.
 */
export function pointAlong(prepared: PreparedRoute, along: number): { lng: number; lat: number; course: number } | null {
  const { shape } = prepared.route;
  const { cumulative } = prepared;
  if (shape.length < 2) return null;
  let i = 0;
  while (i < shape.length - 2 && cumulative[i + 1]! < along) i++;
  // Skip zero-length segments (repeated points), which have no direction.
  let j = i;
  while (j < shape.length - 2 && cumulative[j + 1]! - cumulative[j]! < 0.5) j++;
  const [ax, ay] = shape[j] as LngLat;
  const [bx, by] = shape[j + 1] as LngLat;
  const len = cumulative[j + 1]! - cumulative[j]!;
  const t = len > 0 ? Math.max(0, Math.min(1, (along - cumulative[j]!) / len)) : 0;
  const cosLat = Math.cos((ay * Math.PI) / 180);
  const course = ((Math.atan2((bx - ax) * cosLat, by - ay) * 180) / Math.PI + 360) % 360;
  return { lng: ax + (bx - ax) * t, lat: ay + (by - ay) * t, course };
}
