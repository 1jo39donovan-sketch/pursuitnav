import { POLICE, STANDARD } from "./costing.js";
import type { LngLat } from "./geo.js";
import { detectRestrictions, type Restriction } from "./restrictions.js";
import type { Route, Router } from "./valhalla.js";

export interface PlanOptions {
  minSavingSeconds: number;
  minSavingFraction: number;
  restrictionCheckBudget: number;
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
  | "wrong-way-unavoidable";

export interface Plan {
  standard: Route;
  police: PoliceRoute | null;
  noPoliceReason?: NoPoliceReason;
}

// Each pass excludes the wrong-way sections found so far. One is usually
// enough; a few more cover routes that find a second contraflow lane.
const MAX_REROUTES = 3;

export async function planRoutes(router: Router, from: LngLat, to: LngLat, opts: PlanOptions): Promise<Plan> {
  const [standard, firstPolice] = await Promise.all([
    router.route({ costing: STANDARD, from: { point: from }, to: { point: to } }),
    router.route({ costing: POLICE, from: { point: from }, to: { point: to } }),
  ]);

  const worthIt = (r: Route) => {
    const saving = standard.durationS - r.durationS;
    return saving >= opts.minSavingSeconds && saving >= standard.durationS * opts.minSavingFraction;
  };

  let police = firstPolice;
  const exclude: LngLat[] = [];
  for (let attempt = 0; attempt <= MAX_REROUTES; attempt++) {
    if (!worthIt(police)) return { standard, police: null, noPoliceReason: "not-faster" };

    const edges = await router.traceEdges(police.shape, POLICE);
    const detection = await detectRestrictions(router, police.shape, edges, opts.restrictionCheckBudget);
    const wrongWay = detection.restrictions.filter((r) => r.kind === "wrong-way");

    if (wrongWay.length === 0) {
      if (detection.restrictions.length === 0) {
        return { standard, police: null, noPoliceReason: "no-restrictions-found" };
      }
      return {
        standard,
        police: {
          ...police,
          savingS: standard.durationS - police.durationS,
          restrictions: detection.restrictions.map(({ excludePoints: _e, ...r }) => r),
          restrictionsComplete: detection.complete,
        },
      };
    }

    // Never against the flow of a one-way street: block those sections and try again.
    for (const r of wrongWay) exclude.push(...r.excludePoints);
    police = await router.route({ costing: POLICE, from: { point: from }, to: { point: to }, exclude });
  }
  return { standard, police: null, noPoliceReason: "wrong-way-unavoidable" };
}
