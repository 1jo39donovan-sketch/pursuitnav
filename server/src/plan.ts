import {
  POLICE as TRACE,
  policeFor,
  standardFor,
  VEHICLES,
  type Costing,
  type RoadChoice,
  type VehicleType,
} from "./costing.js";
import { cumulativeDistances, pointAlong, type LngLat } from "./geo.js";
import { detectRestrictions, type Restriction } from "./restrictions.js";
import {
  ValhallaError,
  waysOf,
  type PrivateAccess,
  type Route,
  type Router,
  type SizeLimits,
  type TraceEdge,
  type Waypoint,
} from "./valhalla.js";

export interface PlanOptions {
  minSavingSeconds: number;
  minSavingFraction: number;
  restrictionCheckBudget: number;
  /** Just the standard route, so the app can show it while the blue-light one is worked out. */
  standardOnly?: boolean;
  /** Prefer main roads (default) or any roads. */
  roads?: RoadChoice;
}

export interface PoliceRoute extends Route {
  savingS: number;
  restrictions: Restriction[];
  /** False if not every stretch could be checked: the count is then "at least". */
  restrictionsComplete: boolean;
}

export type NoPoliceReason =
  /** Not enough quicker than the standard route to be worth the risk. */
  | "not-faster"
  /** Quicker, but no restriction could be found to explain why; not offered blind. */
  | "no-restrictions-found"
  /** Couldn't find a version that stays out of contraflow lanes. */
  | "wrong-way-unavoidable"
  /** Couldn't find a version that avoids limits the vehicle can't take. */
  | "vehicle-limit-unavoidable"
  /** Not looked for: the standard route was asked for on its own. */
  | "not-checked";

export interface Plan {
  standard: Route;
  police: PoliceRoute | null;
  noPoliceReason?: NoPoliceReason;
}

interface Along {
  /** A point in the middle of each edge, with its names. */
  mids: Array<{ point: LngLat; names: string[] }>;
  limits: SizeLimits[];
}

/** What's signed on each edge of a route, read at the middle of each. */
async function alongRoute(router: Router, shape: LngLat[], cumulative: number[], edges: TraceEdge[]): Promise<Along> {
  if (!router.sizeLimitsAt || edges.length === 0) return { mids: [], limits: [] };
  const mids = edges.map((e) => {
    const along = (cumulative[e.beginShapeIndex]! + cumulative[e.endShapeIndex]!) / 2;
    return { point: pointAlong(shape, cumulative, along).point, names: e.names };
  });
  return { mids, limits: await router.sizeLimitsAt(mids) };
}

function overOf({ mids, limits }: Along, vehicle: VehicleType) {
  const size = VEHICLES[vehicle];
  return mids.filter((_, k) => {
    const l = limits[k]!;
    return (
      (l.height !== undefined && l.height < size.height) ||
      (l.width !== undefined && l.width < size.width) ||
      (l.length !== undefined && l.length < size.length) ||
      (l.weight !== undefined && l.weight < size.weight)
    );
  });
}

/**
 * Roads on a route under a bridge too low, or over one too weak, for the
 * vehicle (or too narrow or short): a point in the middle of each.
 *
 * Read from the limits signed on each road rather than tested by routing,
 * because Valhalla lets a route start or end on a road the vehicle may not
 * use, and the police costing ignores these limits altogether.
 */
export async function overLimits(router: Router, shape: LngLat[], edges: TraceEdge[], vehicle: VehicleType) {
  return overOf(await alongRoute(router, shape, cumulativeDistances(shape), edges), vehicle);
}

interface PrivateFound extends PrivateAccess {
  /** Where to block it to find another way; absent when the route has to use it. */
  exclude?: LngLat;
}

/** How far past a gate to block the road beyond it, so a crossing road isn't blocked instead. */
const PAST_GATE_M = 5;

/**
 * Private roads and closed gates on a route. Valhalla only adds a time
 * penalty for them when routing for a departure time, so a long enough way
 * round loses to a short cut through a private estate or a locked gate.
 *
 * A private stretch the route starts or ends on is fine: the call is there.
 * Anything else is to be routed round, if there's another way.
 */
async function privateAlong(
  router: Router,
  shape: LngLat[],
  cumulative: number[],
  edges: TraceEdge[],
  along: Along,
): Promise<PrivateFound[]> {
  const n = along.limits.length;
  const isPrivate = (i: number) => !!along.limits[i]?.private;
  let lead = 0;
  while (lead < n && isPrivate(lead)) lead++;
  let trail = n;
  while (trail > lead && isPrivate(trail - 1)) trail--;
  const at = ([lng, lat]: LngLat) => ({ lat, lng });

  const found: PrivateFound[] = [];
  for (let i = lead; i < trail; i++) {
    if (!isPrivate(i) || (i > lead && isPrivate(i - 1))) continue; // one entry per run of private road
    const m = along.mids[i]!;
    const streets = m.names;
    found.push({
      kind: "private-road",
      description: `Private road${streets[0] ? `: ${streets[0]}` : ""}`,
      location: at(m.point),
      streets,
      exclude: m.point,
    });
  }

  // Barriers where one edge meets the next (not at the very start or end).
  const gates = edges.slice(0, -1).flatMap((e, j) => (e.endsAtBarrier ? [j] : []));
  if (gates.length && router.closedBarriersAt) {
    const closed = await router.closedBarriersAt(gates.map((j) => shape[edges[j]!.endShapeIndex]!));
    gates.forEach((j, k) => {
      if (!closed[k]) return;
      const beyond = edges[j + 1]!;
      const point = shape[edges[j]!.endShapeIndex]!;
      const from = cumulative[beyond.beginShapeIndex]!;
      const length = cumulative[beyond.endShapeIndex]! - from;
      const streets = beyond.names.length ? beyond.names : edges[j]!.names;
      // A gate into private road the route starts or ends on is the way in.
      const wayIn = j < lead || j + 1 >= trail;
      found.push({
        kind: "private-gate",
        description: `Private gate${streets[0] ? `: ${streets[0]}` : ""}`,
        location: at(point),
        streets,
        ...(wayIn ? {} : { exclude: pointAlong(shape, cumulative, from + Math.min(PAST_GATE_M, length / 2)).point }),
      });
    });
  }
  return found;
}

const noRoute = (err: unknown) => err instanceof ValhallaError && err.code === 442;

/**
 * A route that keeps clear of limits the vehicle can't take, and of private
 * roads and gates when there's another way, rerouting if needed.
 */
export async function withinLimits(
  router: Router,
  costing: Costing,
  vehicle: VehicleType,
  from: Waypoint,
  to: Waypoint,
  exclude: LngLat[],
  first?: Route,
): Promise<{ route: Route; edges: TraceEdge[] } | null> {
  // Private roads and gates to route round: dropped if there's no way without them.
  const avoidPrivate: LngLat[] = [];
  let keepPrivate = false;
  try {
    let route = first ?? (await router.route({ costing, from, to, exclude }));
    for (let attempt = 0; attempt <= MAX_REROUTES; attempt++) {
      // Traced with the permissive police costing so a road this vehicle
      // shouldn't use still matches, and can be found and avoided.
      const edges = await router.traceEdges(route.shape, TRACE);
      const cumulative = cumulativeDistances(route.shape);
      const along = await alongRoute(router, route.shape, cumulative, edges);
      const over = overOf(along, vehicle);
      const found = await privateAlong(router, route.shape, cumulative, edges, along);
      const avoid = keepPrivate ? [] : found.flatMap((f) => (f.exclude ? [f.exclude] : []));
      if (over.length === 0 && avoid.length === 0) {
        const privateAccess = found.map(({ exclude: _e, ...f }) => f);
        return { route: privateAccess.length ? { ...route, privateAccess } : route, edges };
      }
      exclude.push(...over.map((o) => o.point));
      avoidPrivate.push(...avoid);
      try {
        route = await router.route({ costing, from, to, exclude: [...exclude, ...avoidPrivate] });
      } catch (err) {
        if (!noRoute(err) || avoidPrivate.length === 0) throw err;
        // The only way is through: keep it, and the crew is told.
        keepPrivate = true;
        avoidPrivate.length = 0;
        route = await router.route({ costing, from, to, exclude });
      }
    }
    return null;
  } catch (err) {
    // No route at all once the unusable roads are excluded.
    if (noRoute(err)) return null;
    throw err;
  }
}

// Each pass excludes the wrong-way and too-small sections found so far. One
// is usually enough; a few more cover routes that find another.
const MAX_REROUTES = 4;

export async function planRoutes(
  router: Router,
  from: LngLat,
  to: LngLat,
  opts: PlanOptions,
  /** Direction of travel, so a moving car isn't sent on a U-turn first. */
  heading?: number,
  vehicle: VehicleType = "car",
): Promise<Plan> {
  const noWay = (err: unknown) => err instanceof ValhallaError && err.httpStatus < 500;
  try {
    return await planFrom(router, from, to, opts, heading, vehicle);
  } catch (err) {
    if (!noWay(err)) throw err;
  }
  // Starting the way the car is facing can leave no way at all (GPS a few
  // metres onto a one-way side street, or on a junction): the crew saw "No
  // route found", then a route on Retry. Try again from the same point in any
  // direction before saying there's no route.
  if (heading !== undefined) {
    try {
      return await planFrom(router, from, to, opts, undefined, vehicle);
    } catch (err) {
      if (!noWay(err)) throw err;
    }
  }
  // A point inside a park or an estate can snap to a little island of roads
  // that leads nowhere (Clapham Common, 3 Nov: 422). Snap both ends only to
  // roads well joined to the rest instead.
  return planFrom(router, from, to, opts, undefined, vehicle, WELL_JOINED);
}

/** Junctions a snapped road must reach on the retry: more than any island in a park or estate. */
const WELL_JOINED = 500;

async function planFrom(
  router: Router,
  from: LngLat,
  to: LngLat,
  opts: PlanOptions,
  heading: number | undefined,
  vehicle: VehicleType,
  reachability?: number,
): Promise<Plan> {
  const STANDARD = standardFor(vehicle, opts.roads);
  const POLICE = policeFor(vehicle, opts.roads);
  const start = { point: from, heading, reachability };
  const end = { point: to, reachability };
  const [firstStandard, firstPolice] = await Promise.all([
    router.route({ costing: STANDARD, from: start, to: end }),
    opts.standardOnly ? null : router.route({ costing: POLICE, from: start, to: end }),
  ]);
  const safeStandard = await withinLimits(router, STANDARD, vehicle, start, end, [], firstStandard);
  if (!safeStandard) throw new NoSafeRouteError();
  const standard = { ...safeStandard.route, ways: waysOf(safeStandard.edges) };
  if (!firstPolice) return { standard, police: null, noPoliceReason: "not-checked" };

  const worthIt = (r: Route) => {
    const saving = standard.durationS - r.durationS;
    return saving >= opts.minSavingSeconds && saving >= standard.durationS * opts.minSavingFraction;
  };

  const exclude: LngLat[] = [];
  let police: Route = firstPolice;
  for (let attempt = 0; attempt <= MAX_REROUTES; attempt++) {
    if (!worthIt(police)) return { standard, police: null, noPoliceReason: "not-faster" };

    const safe = await withinLimits(router, POLICE, vehicle, start, end, exclude, police);
    if (!safe) return { standard, police: null, noPoliceReason: "vehicle-limit-unavoidable" };
    police = safe.route;
    if (!worthIt(police)) return { standard, police: null, noPoliceReason: "not-faster" };
    const edges = safe.edges;
    const detection = await detectRestrictions(router, police.shape, edges, opts.restrictionCheckBudget, STANDARD);
    const blocked = detection.restrictions.filter((r) => r.kind === "wrong-way");

    if (blocked.length === 0) {
      if (detection.restrictions.length === 0) {
        return { standard, police: null, noPoliceReason: "no-restrictions-found" };
      }
      return {
        standard,
        police: {
          ...police,
          ways: waysOf(edges),
          savingS: standard.durationS - police.durationS,
          restrictions: detection.restrictions.map(({ excludePoints: _e, ...r }) => r),
          restrictionsComplete: detection.complete,
        },
      };
    }

    // Never against the flow of a one-way street: block those sections and try again.
    for (const r of blocked) exclude.push(...r.excludePoints);
    try {
      police = await router.route({ costing: POLICE, from: start, to: end, exclude });
    } catch (err) {
      // No way left once the wrong-way sections are blocked: no blue-light
      // route, but the standard route still stands.
      if (err instanceof ValhallaError && err.code === 442) {
        return { standard, police: null, noPoliceReason: "wrong-way-unavoidable" };
      }
      throw err;
    }
  }
  return { standard, police: null, noPoliceReason: "wrong-way-unavoidable" };
}

/** No route avoids the limits the vehicle can't take. */
export class NoSafeRouteError extends Error {
  constructor(message = "No route found that avoids low bridges and weight limits for this vehicle.") {
    super(message);
  }
}
