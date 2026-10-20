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
import { ValhallaError, waysOf, type Route, type Router, type TraceEdge, type Waypoint } from "./valhalla.js";

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

/**
 * Roads on a route under a bridge too low, or over one too weak, for the
 * vehicle (or too narrow or short): a point in the middle of each.
 *
 * Read from the limits signed on each road rather than tested by routing,
 * because Valhalla lets a route start or end on a road the vehicle may not
 * use, and the police costing ignores these limits altogether.
 */
export async function overLimits(router: Router, shape: LngLat[], edges: TraceEdge[], vehicle: VehicleType) {
  if (!router.sizeLimitsAt || edges.length === 0) return [];
  const size = VEHICLES[vehicle];
  const cumulative = cumulativeDistances(shape);
  const mids = edges.map((e) => {
    const along = (cumulative[e.beginShapeIndex]! + cumulative[e.endShapeIndex]!) / 2;
    return { point: pointAlong(shape, cumulative, along).point, names: e.names };
  });
  const limits = await router.sizeLimitsAt(mids);
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

/** A route that keeps clear of limits the vehicle can't take, rerouting if needed. */
async function withinLimits(
  router: Router,
  costing: Costing,
  vehicle: VehicleType,
  from: Waypoint,
  to: Waypoint,
  exclude: LngLat[],
  first?: Route,
): Promise<{ route: Route; edges: TraceEdge[] } | null> {
  try {
    let route = first ?? (await router.route({ costing, from, to, exclude }));
    for (let attempt = 0; attempt <= MAX_REROUTES; attempt++) {
      // Traced with the permissive police costing so a road this vehicle
      // shouldn't use still matches, and can be found and avoided.
      const edges = await router.traceEdges(route.shape, TRACE);
      const over = await overLimits(router, route.shape, edges, vehicle);
      if (over.length === 0) return { route, edges };
      exclude.push(...over.map((o) => o.point));
      route = await router.route({ costing, from, to, exclude });
    }
    return null;
  } catch (err) {
    // No route at all once the unusable roads are excluded.
    if (err instanceof ValhallaError && err.code === 442) return null;
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
  const STANDARD = standardFor(vehicle, opts.roads);
  const POLICE = policeFor(vehicle, opts.roads);
  const start = { point: from, heading };
  const end = { point: to };
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
