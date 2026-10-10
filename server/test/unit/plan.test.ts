import { describe, expect, it } from "vitest";

import { POLICE, STANDARD } from "../../src/costing.js";
import type { LngLat } from "../../src/geo.js";
import { planRoutes } from "../../src/plan.js";
import { detectRestrictions } from "../../src/restrictions.js";
import type { Route, RouteRequest, Router, TraceEdge } from "../../src/valhalla.js";

// A straight road north, split into ten 100 m edges.
const shape: LngLat[] = Array.from({ length: 11 }, (_, i) => [0, 51 + i * 0.0009]);
const edges: TraceEdge[] = Array.from({ length: 10 }, (_, i) => ({
  names: [`Road ${i}`],
  beginShapeIndex: i,
  endShapeIndex: i + 1,
  beginHeading: 0,
  endHeading: 0,
}));

const route = (durationS: number): Route => ({ durationS, distanceM: 1000, shape, maneuvers: [] });

/** Fake router: police is quicker; car checks report every stretch as needing a detour. */
function fakeRouter(opts: { carAlwaysDetours: boolean }): Router & { carChecks: number } {
  return {
    carChecks: 0,
    async route(req: RouteRequest) {
      if (req.distanceOnly) {
        this.carChecks++;
        return { ...route(0), distanceM: opts.carAlwaysDetours ? 1e6 : 1 };
      }
      return req.costing === POLICE ? route(100) : route(200);
    },
    async traceEdges() {
      return edges;
    },
  };
}

const options = { minSavingSeconds: 30, minSavingFraction: 0.05, restrictionCheckBudget: 150 };

describe("detectRestrictions", () => {
  it("stops at the check budget and says the list is incomplete", async () => {
    const router = fakeRouter({ carAlwaysDetours: true });
    const result = await detectRestrictions(router, shape, edges, 5);
    expect(result.checks).toBe(5);
    expect(result.complete).toBe(false);
    expect(router.carChecks).toBe(5);
  });

  it("checks a clean route once", async () => {
    const router = fakeRouter({ carAlwaysDetours: false });
    const result = await detectRestrictions(router, shape, edges, 150);
    expect(result).toMatchObject({ restrictions: [], complete: true, checks: 1 });
  });
});

describe("planRoutes", () => {
  it("doesn't offer a faster police route when no restriction explains it", async () => {
    const plan = await planRoutes(fakeRouter({ carAlwaysDetours: false }), [0, 51], [0, 51.01], options);
    expect(plan.police).toBeNull();
    expect(plan.noPoliceReason).toBe("no-restrictions-found");
  });

  it("uses standard and police costing for the two routes", async () => {
    const seen: string[] = [];
    const router: Router = {
      async route(req) {
        if (!req.distanceOnly) seen.push(req.costing.costing);
        return route(100);
      },
      async traceEdges() {
        return edges;
      },
    };
    await planRoutes(router, [0, 51], [0, 51.01], options);
    expect(seen.sort()).toEqual([POLICE.costing, STANDARD.costing].sort());
  });
});
