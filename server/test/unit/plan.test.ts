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

/** Metres along the test road (straight north from 51°) for a waypoint. */
const alongOf = (point: LngLat) => Math.round(((point[1] - 51) / 0.0009) * 100);

/** Fake router whose legal car route from a to b is `carDistance(a, b)` metres. */
function carRouter(carDistance: (a: number, b: number) => number): Router {
  return {
    async route(req: RouteRequest) {
      if (!req.distanceOnly) return route(100);
      return { ...route(0), distanceM: carDistance(alongOf(req.from.point), alongOf(req.to.point)) };
    },
    async traceEdges() {
      return edges;
    },
  };
}

describe("detectRestrictions: restrictions across several roads", () => {
  it("invents nothing when a car only prefers longer, faster roads over a long stretch", async () => {
    // Up to 400 m a car goes the same way; further, it takes main roads 20% longer.
    const router = carRouter((a, b) => (b - a <= 400 ? b - a : (b - a) * 1.2));
    const result = await detectRestrictions(router, shape, edges, 150);
    expect(result.restrictions).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("still finds a banned move through a short link road, as one short manoeuvre", async () => {
    // Cars may not go from Road 4 through Road 5 into Road 6 (each pair is fine).
    const router = carRouter((a, b) => (a < 500 && b > 600 ? (b - a) * 3 : b - a));
    const result = await detectRestrictions(router, shape, edges, 150);
    expect(result.restrictions).toHaveLength(1);
    expect(result.restrictions[0]).toMatchObject({ kind: "manoeuvre" });
    expect(result.restrictions[0]!.streets).toEqual(expect.arrayContaining(["Road 4", "Road 5", "Road 6"]));
    expect(result.restrictions[0]!.streets.length).toBeLessThanOrEqual(4);
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

describe("starting the way the car is facing", () => {
  it("tries again in any direction when the heading leaves no route", async () => {
    const { ValhallaError } = await import("../../src/valhalla.js");
    const calls: (number | undefined)[] = [];
    const router: Router = {
      async route(req: RouteRequest) {
        calls.push(req.from.heading);
        if (req.from.heading !== undefined) throw new ValhallaError("No path could be found", 400, 442);
        if (req.distanceOnly) return { ...route(0), distanceM: 1 };
        return route(200);
      },
      async traceEdges() {
        return edges;
      },
    };
    const plan = await planRoutes(router, shape[0]!, shape[10]!, { ...options, standardOnly: true }, 90);
    expect(plan.standard.durationS).toBe(200);
    expect(calls[0]).toBe(90);
    expect(calls.at(-1)).toBeUndefined();
  });
});
