// Works out which restrictions a police route relies on, by asking whether a
// car could legally drive each stretch of it.
//
// Valhalla has no per-edge "buses only" flag to read back, so the test is
// behavioural: route a car between two points on the police route. If the car
// can do it in about the same distance, that stretch is legal. If it has to
// detour (or can't get there at all), the stretch contains something only the
// police route is allowed to do. Failing stretches are halved until the
// culprit is a single edge (a bus-only road) or a pair of edges (a banned
// turn). Clean stretches are never split, so a route with two restrictions
// costs a few dozen checks, not one per edge.

import { STANDARD } from "./costing.js";
import { cumulativeDistances, pointAlong, turnAngle, type LngLat } from "./geo.js";
import { ValhallaError, type Router, type TraceEdge, type Waypoint } from "./valhalla.js";

export type RestrictionKind =
  /** A turn cars may not make (no right turn, left turn only, …). */
  | "turn"
  /** A road or section cars may not use at all (bus gate, bus-only road). */
  | "bus-only"
  /** A restriction spanning several roads that couldn't be narrowed down. */
  | "manoeuvre"
  /**
   * Against the flow of a one-way street, e.g. in a contraflow bus lane.
   * Never acceptable: planRoutes() reroutes to avoid these.
   */
  | "wrong-way";

export interface Restriction {
  kind: RestrictionKind;
  /** Plain-English line for the operator, e.g. "No right turn: Upper Street into Islington Green". */
  description: string;
  location: { lat: number; lng: number };
  streets: string[];
}

export interface DetectedRestriction extends Restriction {
  /** Points on the offending road(s), used to reroute around wrong-way sections. */
  excludePoints: LngLat[];
}

export interface DetectionResult {
  restrictions: DetectedRestriction[];
  /** False if the check budget ran out; the list is then a lower bound. */
  complete: boolean;
  checks: number;
}

// A car route counts as "the same" if it is no more than 2% + 25 m longer.
// Any genuine detour round a block in London is far more than that.
const SLACK_FRACTION = 1.02;
const SLACK_METRES = 25;

const streetName = (edge: TraceEdge) => edge.names[0] ?? "unnamed road";

function turnPhrase(angle: number): string {
  const a = Math.abs(angle);
  if (a > 150) return "No U-turn";
  if (a < 30) return "No straight on";
  return angle > 0 ? "No right turn" : "No left turn";
}

export async function detectRestrictions(
  router: Router,
  shape: LngLat[],
  edges: TraceEdge[],
  budget: number,
): Promise<DetectionResult> {
  const cumulative = cumulativeDistances(shape);
  let checks = 0;
  let complete = true;
  const found = new Map<string, DetectedRestriction & { order: number; first: number; last: number }>();

  const edgeStart = (k: number) => cumulative[edges[k]!.beginShapeIndex]!;
  const edgeEnd = (k: number) => cumulative[edges[k]!.endShapeIndex]!;
  const alongEdge = (k: number, fraction: number) => edgeStart(k) + (edgeEnd(k) - edgeStart(k)) * fraction;

  function waypoint(along: number, reverse = false): Waypoint & { along: number } {
    const { point, heading } = pointAlong(shape, cumulative, along);
    return { point, heading: reverse ? (heading + 180) % 360 : heading, along };
  }

  /**
   * Can a car get from a to b about as directly as the police route does?
   * Undefined once the check budget is spent.
   */
  async function carCanDo(a: Waypoint, b: Waypoint, routeDistance: number): Promise<boolean | undefined> {
    if (checks >= budget) {
      complete = false;
      return undefined;
    }
    checks++;
    try {
      const car = await router.route({ costing: STANDARD, from: a, to: b, distanceOnly: true });
      return car.distanceM <= routeDistance * SLACK_FRACTION + SLACK_METRES;
    } catch (err) {
      // No legal car route at all is the clearest possible "no".
      if (err instanceof ValhallaError && err.httpStatus < 500) return false;
      throw err;
    }
  }

  /** Is the stretch from edge i to edge j legal for a car? */
  async function stretchIsLegal(i: number, j: number): Promise<boolean> {
    // A single edge is tested from a quarter to three quarters along it; a
    // longer stretch from the middle of its first edge to the middle of its last.
    const a = waypoint(alongEdge(i, i === j ? 0.25 : 0.5));
    const b = waypoint(alongEdge(j, i === j ? 0.75 : 0.5));
    // Unchecked counts as legal so nothing is invented; `complete` tells the caller.
    return (await carCanDo(a, b, b.along - a.along)) ?? true;
  }

  function record(key: string, first: number, last: number, r: DetectedRestriction) {
    if (!found.has(key)) found.set(key, { ...r, order: first, first, last });
  }

  async function recordEdge(k: number) {
    const name = streetName(edges[k]!);
    const mid = waypoint(alongEdge(k, 0.5));
    // Bus-only one way, or a one-way street driven backwards? If a car could
    // legally drive this edge in the opposite direction, it's the latter.
    const back = waypoint(alongEdge(k, 0.75), true);
    const forward = waypoint(alongEdge(k, 0.25), true);
    // If that can't be checked, assume the worse case so the section is avoided.
    const wrongWay = (await carCanDo(back, forward, back.along - forward.along)) ?? true;
    record(`edge:${k}`, k, k, {
      kind: wrongWay ? "wrong-way" : "bus-only",
      description: wrongWay ? `Wrong way along one-way street: ${name}` : `Bus-only section: ${name}`,
      location: { lat: mid.point[1], lng: mid.point[0] },
      streets: [name],
      excludePoints: [mid.point],
    });
  }

  function recordTurn(i: number, j: number) {
    const from = streetName(edges[i]!);
    const to = streetName(edges[j]!);
    const at = shape[edges[j]!.beginShapeIndex]!;
    const phrase = turnPhrase(turnAngle(edges[i]!.endHeading, edges[j]!.beginHeading));
    record(`turn:${i}`, i, j, {
      kind: "turn",
      description: `${phrase}: ${from} into ${to}`,
      location: { lat: at[1], lng: at[0] },
      streets: [from, to],
      excludePoints: [],
    });
  }

  function recordManoeuvre(i: number, j: number) {
    const names = [...new Set(edges.slice(i, j + 1).map(streetName))];
    const mid = waypoint((alongEdge(i, 0.5) + alongEdge(j, 0.5)) / 2);
    record(`manoeuvre:${i}-${j}`, i, j, {
      kind: "manoeuvre",
      description: `Restricted manoeuvre: ${names.join(" → ")}`,
      location: { lat: mid.point[1], lng: mid.point[0] },
      streets: names,
      excludePoints: [],
    });
  }

  /** Narrow down what makes the (illegal) stretch i..j illegal. */
  async function locate(i: number, j: number): Promise<void> {
    if (i === j) return recordEdge(i);
    if (j === i + 1) {
      const firstOk = await stretchIsLegal(i, i);
      const secondOk = await stretchIsLegal(j, j);
      if (!firstOk) await recordEdge(i);
      if (!secondOk) await recordEdge(j);
      if (firstOk && secondOk) recordTurn(i, j);
      return;
    }
    // Halves share the middle edge, so a turn onto or off it is in one of them.
    const m = Math.floor((i + j) / 2);
    const leftOk = await stretchIsLegal(i, m);
    const rightOk = await stretchIsLegal(m, j);
    if (!leftOk) await locate(i, m);
    if (!rightOk) await locate(m, j);
    // Each half is fine on its own but not together: a restriction that
    // spans the join, e.g. a banned turn via a short link road.
    if (leftOk && rightOk) recordManoeuvre(i, j);
  }

  if (edges.length > 0 && !(await stretchIsLegal(0, edges.length - 1))) {
    await locate(0, edges.length - 1);
  }

  return { restrictions: mergeSections([...found.values()]), complete, checks };
}

/** Joins runs of adjacent bus-only (or wrong-way) edges into one section each. */
function mergeSections(
  items: Array<DetectedRestriction & { order: number; first: number; last: number }>,
): DetectedRestriction[] {
  const sorted = items.sort((a, b) => a.order - b.order || a.first - b.first);
  const out: typeof sorted = [];
  for (const item of sorted) {
    const prev = out[out.length - 1];
    const joinable = item.kind === "bus-only" || item.kind === "wrong-way";
    if (prev && joinable && prev.kind === item.kind && item.first === prev.last + 1) {
      prev.last = item.last;
      prev.excludePoints.push(...item.excludePoints);
      for (const s of item.streets) if (!prev.streets.includes(s)) prev.streets.push(s);
      const label = item.kind === "bus-only" ? "Bus-only section" : "Wrong way along one-way street";
      prev.description = `${label}: ${prev.streets.join(", ")}`;
      continue;
    }
    out.push({ ...item, excludePoints: [...item.excludePoints], streets: [...item.streets] });
  }
  return out.map(({ order: _o, first: _f, last: _l, ...r }) => r);
}
