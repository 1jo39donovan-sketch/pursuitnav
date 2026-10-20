// End-to-end: the API against a real Valhalla server running on the
// synthetic street network in test/fixtures/make_fixture.py.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { avoidingClosures, boxesAlong, ClosureFeed } from "../../src/closures.js";
import type { ServerConfig } from "../../src/config.js";
import { POLICE, policeFor, STANDARD } from "../../src/costing.js";
import type { LngLat } from "../../src/geo.js";
import type { Plan } from "../../src/plan.js";
import { ValhallaClient } from "../../src/valhalla.js";

const points = inject("points");
const client = new ValhallaClient(inject("valhallaUrl"));
const config: ServerConfig = {
  port: 0,
  host: "127.0.0.1",
  valhallaUrl: inject("valhallaUrl"),
  bounds: [-0.8, 51.2, 0.6, 51.8],
  minSavingSeconds: 30,
  minSavingFraction: 0.05,
  restrictionCheckBudget: 150,
  osPlacesKey: undefined,
  placesFile: "/nonexistent",
};
const app = buildApp(config, client);

beforeAll(() => app.ready());
afterAll(() => app.close());

const at = (name: string) => points[name]!;
const lngLat = (name: string): LngLat => [at(name).lng, at(name).lat];

async function plan(from: string, to: string, vehicle?: string): Promise<Plan> {
  const res = await app.inject({ method: "POST", url: "/v1/routes", payload: { from: at(from), to: at(to), vehicle } });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as Plan;
}

/**
 * True if the shape travels west along the stretch of street at `lat`
 * between the two longitudes: the wrong way down an eastbound one-way street.
 */
function goesWestAlong(shape: LngLat[], lat: number, west: number, east: number): boolean {
  const onStreet = (p: LngLat) => Math.abs(p[1] - lat) < 1e-5 && p[0] >= west - 1e-6 && p[0] <= east + 1e-6;
  return shape.some((p, i) => i > 0 && onStreet(p) && onStreet(shape[i - 1]!) && p[0] < shape[i - 1]![0]);
}

describe("one-way streets", () => {
  // Oneway Street runs east only. Heading west along it would be the shortest way.
  const street = () => [at("oneway_west_end").lat, at("oneway_west_end").lng, at("oneway_east_end").lng] as const;

  it("police costing on its own never goes the wrong way", async () => {
    const route = await client.route({
      costing: POLICE,
      from: { point: lngLat("oneway_east_end") },
      to: { point: lngLat("oneway_west_end") },
    });
    expect(goesWestAlong(route.shape, ...street())).toBe(false);
  });

  it("neither route offered goes the wrong way", async () => {
    const result = await plan("oneway_east_end", "oneway_west_end");
    expect(goesWestAlong(result.standard.shape, ...street())).toBe(false);
    if (result.police) expect(goesWestAlong(result.police.shape, ...street())).toBe(false);
  });
});

describe("contraflow bus lanes", () => {
  // Contraflow Street is one-way east for cars, with a westbound bus lane.
  const street = () =>
    [at("contraflow_west_end").lat, at("contraflow_west_end").lng, at("contraflow_east_end").lng] as const;

  it("bus costing alone would use the contraflow lane (why the check exists)", async () => {
    const route = await client.route({
      costing: POLICE,
      from: { point: lngLat("contraflow_east_end") },
      to: { point: lngLat("contraflow_west_end") },
    });
    expect(goesWestAlong(route.shape, ...street())).toBe(true);
  });

  it("the police route offered never goes the wrong way", async () => {
    const result = await plan("contraflow_east_end", "contraflow_west_end");
    expect(goesWestAlong(result.standard.shape, ...street())).toBe(false);
    // Once the contraflow lane is excluded the police route is no quicker, so it isn't offered.
    expect(result.police).toBeNull();
    expect(result.noPoliceReason).toBe("not-faster");
  });
});

describe("bus gates", () => {
  it("offers the police route through the bus gate and lists it", async () => {
    const result = await plan("gate_west_end", "gate_east_end");
    expect(result.standard.maneuvers.flatMap((m) => m.streetNames)).not.toContain("Gate Street");
    expect(result.police).not.toBeNull();
    const police = result.police!;
    expect(police.maneuvers.flatMap((m) => m.streetNames)).toContain("Gate Street");
    expect(police.savingS).toBeGreaterThanOrEqual(30);
    expect(police.restrictionsComplete).toBe(true);
    expect(police.restrictions).toHaveLength(1);
    expect(police.restrictions[0]).toMatchObject({
      kind: "bus-only",
      description: "Bus-only section: Gate Street",
      streets: ["Gate Street"],
    });
  });
});

describe("turn restrictions", () => {
  it("offers the police route through the banned turn and names it", async () => {
    const result = await plan("turn_start", "turn_end");
    expect(result.police).not.toBeNull();
    const police = result.police!;
    expect(police.durationS).toBeLessThan(result.standard.durationS);
    expect(police.restrictions).toHaveLength(1);
    expect(police.restrictions[0]).toMatchObject({
      kind: "turn",
      description: "No right turn: Turn Street into Column 1 Road",
    });
    // The turn is at the junction of Turn Street and Column 1 Road.
    const junction = at("turn_start");
    expect(police.restrictions[0]!.location.lat).toBeCloseTo(junction.lat, 4);
  });
});

describe("vehicle size and weight", () => {
  // Bridge Street passes under a 2.0 m bridge between columns 0 and 1 of its
  // row; Weak Bridge Road crosses a 3.5 t bridge between rows 0 and 1.
  const DLNG = 0.003;
  const DLAT = -0.002;
  const lowBridge = (): [LngLat, LngLat] => {
    const w = at("bridge_west");
    return [[w.lng + DLNG, w.lat], [w.lng + 2 * DLNG, w.lat]];
  };
  const weakBridge = (): [LngLat, LngLat] => {
    const n = at("weak_north");
    return [[n.lng, n.lat + DLAT], [n.lng, n.lat + 2 * DLAT]];
  };
  /** True if the shape runs along the straight segment a–b. */
  function uses(shape: LngLat[], [a, b]: [LngLat, LngLat]): boolean {
    const on = (p: LngLat) => {
      const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      const within =
        p[0] >= Math.min(a[0], b[0]) - 1e-6 && p[0] <= Math.max(a[0], b[0]) + 1e-6 &&
        p[1] >= Math.min(a[1], b[1]) - 1e-6 && p[1] <= Math.max(a[1], b[1]) + 1e-6;
      return Math.abs(cross) < 1e-9 && within;
    };
    return shape.some((p, i) => i > 0 && on(p) && on(shape[i - 1]!) && (p[0] !== shape[i - 1]![0] || p[1] !== shape[i - 1]![1]));
  }

  it("a car takes both bridges", async () => {
    expect(uses((await plan("bridge_west", "bridge_east", "car")).standard.shape, lowBridge())).toBe(true);
    expect(uses((await plan("weak_north", "weak_south", "car")).standard.shape, weakBridge())).toBe(true);
  });

  it("police costing on its own would send a van under the low bridge (why the check exists)", async () => {
    const route = await client.route({
      costing: policeFor("van"),
      from: { point: lngLat("bridge_west") },
      to: { point: lngLat("bridge_east") },
    });
    expect(uses(route.shape, lowBridge())).toBe(true);
  });

  for (const vehicle of ["van", "carrier", "ambulance", "fire"]) {
    it(`neither route sends a ${vehicle} under the 2.0 m bridge`, async () => {
      const result = await plan("bridge_west", "bridge_east", vehicle);
      expect(uses(result.standard.shape, lowBridge())).toBe(false);
      if (result.police) expect(uses(result.police.shape, lowBridge())).toBe(false);
    });
  }

  it("neither route sends a fire appliance over the 3.5 t bridge", async () => {
    const result = await plan("weak_north", "weak_south", "fire");
    expect(uses(result.standard.shape, weakBridge())).toBe(false);
    if (result.police) expect(uses(result.police.shape, weakBridge())).toBe(false);
  });

  it("the police route check finds the bridge and goes round it", async () => {
    // Called directly so the check is seen to run: the first police route
    // goes under the bridge, so planRoutes must have rerouted.
    const result = await plan("bridge_west", "bridge_east", "van");
    expect(result.police).toBeNull();
    expect(result.noPoliceReason).toBe("not-faster");
  });

  it("a van still gets the police route through a bus gate", async () => {
    const result = await plan("gate_west_end", "gate_east_end", "van");
    expect(result.police?.restrictions[0]).toMatchObject({ kind: "bus-only" });
  });

  it("refuses an unknown vehicle", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes",
      payload: { from: at("plain_start"), to: at("plain_end"), vehicle: "tank" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("main roads", () => {
  it("takes the main road over a slightly shorter back street", async () => {
    const result = await plan("main_west", "main_east");
    const streets = result.standard.maneuvers.flatMap((m) => m.streetNames);
    expect(streets).toContain("High Road");
    expect(streets).not.toContain("Back Street");
  });

  it("lists the OpenStreetMap ways along it, for opt-in learning", async () => {
    const { ways } = (await plan("main_west", "main_east")).standard as Plan["standard"] & {
      ways: { wayId: number; beginShapeIndex: number; endShapeIndex: number }[];
    };
    expect(ways.length).toBeGreaterThanOrEqual(3);
    expect(ways.every((w) => Number.isInteger(w.wayId) && w.endShapeIndex > w.beginShapeIndex)).toBe(true);
  });

  it("takes the shorter back street when set to any roads", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes",
      payload: { from: at("main_west"), to: at("main_east"), roads: "any" },
    });
    const streets = (res.json() as Plan).standard.maneuvers.flatMap((m) => m.streetNames);
    expect(streets).toContain("Back Street");
  });
});

describe("live road closures", () => {
  // A block of High Road is fully closed: both routes go by Back Street instead.
  const feed = new ClosureFeed();
  feed.set([{ id: "t1", street: "High Road", rings: boxesAlong([lngLat("high_road_1"), lngLat("high_road_2")]) }]);
  const closedApp = buildApp(config, avoidingClosures(client, feed, 50), undefined, undefined, feed);
  beforeAll(() => closedApp.ready());
  afterAll(() => closedApp.close());

  it("routes round a closed road and says closures were avoided", async () => {
    const res = await closedApp.inject({
      method: "POST",
      url: "/v1/routes",
      payload: { from: at("main_west"), to: at("main_east") },
    });
    expect(res.statusCode, res.body).toBe(200);
    const result = res.json() as Plan & { closures: { active: number; ignored: boolean } };
    const streets = result.standard.maneuvers.flatMap((m) => m.streetNames);
    expect(streets).toContain("Back Street");
    expect(streets).not.toContain("High Road");
    expect(result.closures).toMatchObject({ active: 1, ignored: false });
  });

  it("leaves a closure at the destination to the officer", async () => {
    const res = await closedApp.inject({
      method: "POST",
      url: "/v1/routes",
      payload: { from: at("main_west"), to: at("high_road_2") },
    });
    expect(res.statusCode, res.body).toBe(200);
  });
});

describe("follow-in", () => {
  /** Points every ~30 m from a to b, as a phone would record a drive. */
  const drive = (a: LngLat, b: LngLat): LngLat[] =>
    Array.from({ length: 8 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / 7, a[1] + ((b[1] - a[1]) * i) / 7] as LngLat);
  const backStreet = (from: number, to: number): LngLat[] => {
    const col = (c: number): LngLat => [lngLat("main_west")[0] + c * 0.003, lngLat("main_west")[1]];
    const out: LngLat[] = [];
    for (let c = from; c < to; c++) out.push(...drive(col(c), col(c + 1)).slice(c === from ? 0 : 1));
    return out;
  };
  const follow = (from: string, track: LngLat[]) =>
    app.inject({ method: "POST", url: "/v1/follow", payload: { from: at(from), track } });

  it("goes the way they drove, not the way the router would choose", async () => {
    // Left to itself the route takes High Road; they went along Back Street.
    const res = await follow("main_west", backStreet(0, 3));
    expect(res.statusCode, res.body).toBe(200);
    const streets = res.json().route.maneuvers.flatMap((m: { streetNames: string[] }) => m.streetNames);
    expect(streets).toContain("Back Street");
    expect(streets).not.toContain("High Road");
  });

  it("drives you to their track first, as one route with one arrival", async () => {
    const res = await follow("main_west", backStreet(1, 3));
    expect(res.statusCode, res.body).toBe(200);
    const { route } = res.json() as { route: Plan["standard"] };
    expect(route.distanceM).toBeGreaterThan(550);
    expect(route.maneuvers.filter((m) => [4, 5, 6].includes(m.type))).toHaveLength(1);
    expect(route.maneuvers.at(-1)!.endShapeIndex).toBe(route.shape.length - 1);
  });

  it("won't follow them the wrong way down a one-way street", async () => {
    // Buses may go west along Contraflow Street; the police route may not.
    const res = await follow("contraflow_east_end", drive(lngLat("contraflow_east_end"), lngLat("contraflow_west_end")));
    expect(res.statusCode, res.body).toBe(422);
    expect(res.json().error).toBe("follow-refused");
  });
});

describe("standard route on its own", () => {
  it("comes back without the blue-light work, for showing straight away", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes",
      payload: { from: at("gate_west_end"), to: at("gate_east_end"), standardOnly: true },
    });
    const result = res.json() as Plan;
    expect(result.standard.distanceM).toBeGreaterThan(0);
    expect(result.police).toBeNull();
    expect(result.noPoliceReason).toBe("not-checked");
  });
});

describe("no restrictions to gain from", () => {
  it("doesn't offer a police route when it's no faster", async () => {
    const result = await plan("plain_start", "plain_end");
    expect(result.standard.durationS).toBeGreaterThan(0);
    expect(result.police).toBeNull();
    expect(result.noPoliceReason).toBe("not-faster");
  });
});

describe("standard route", () => {
  it("starts and ends where asked, with turn-by-turn steps", async () => {
    const result = await plan("gate_west_end", "gate_east_end");
    const shape = result.standard.shape;
    expect(shape[0]![0]).toBeCloseTo(at("gate_west_end").lng, 4);
    expect(shape[shape.length - 1]![0]).toBeCloseTo(at("gate_east_end").lng, 4);
    expect(result.standard.maneuvers.length).toBeGreaterThan(1);
    expect(result.standard.maneuvers[0]!.instruction).toMatch(/\w/);
  });

  it("uses legal car costing", async () => {
    const direct = await client.route({
      costing: STANDARD,
      from: { point: lngLat("turn_start") },
      to: { point: lngLat("turn_end") },
    });
    const result = await plan("turn_start", "turn_end");
    expect(result.standard.distanceM).toBeCloseTo(direct.distanceM, 0);
  });
});

describe("direction of travel", () => {
  it("starts the route the way the car is heading instead of a U-turn", async () => {
    // Heading east along Turn Street, past the junction, going back to Column 1 Road.
    const at = { lat: points.turn_start!.lat, lng: points.turn_start!.lng + 0.0045 };
    const headingEast = await app.inject({
      method: "POST",
      url: "/v1/routes",
      payload: { from: { ...at, heading: 90 }, to: points.turn_end },
    });
    const shape = (headingEast.json() as Plan).standard.shape;
    // The first step goes east (longitude increases), not back west.
    expect(shape[1]![0]).toBeGreaterThan(shape[0]![0]);
  });
});

describe("request checks", () => {
  it("refuses points outside the covered area", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes",
      payload: { from: at("plain_start"), to: { lat: 53.48, lng: -2.24 } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: "outside-area" });
  });

  it("refuses malformed requests", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/routes", payload: { from: { lat: "x" } } });
    expect(res.statusCode).toBe(400);
  });

  it("explains when there's no route between the points", async () => {
    // The test scenarios are separate street networks with no roads between them.
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes",
      payload: { from: at("plain_start"), to: at("gate_west_end") },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: "no-route" });
  });
});
