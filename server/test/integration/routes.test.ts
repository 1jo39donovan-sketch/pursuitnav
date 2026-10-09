// End-to-end: the API against a real Valhalla server running on the
// synthetic street network in test/fixtures/make_fixture.py.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import { POLICE, STANDARD } from "../../src/costing.js";
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
};
const app = buildApp(config, client);

beforeAll(() => app.ready());
afterAll(() => app.close());

const at = (name: string) => points[name]!;
const lngLat = (name: string): LngLat => [at(name).lng, at(name).lat];

async function plan(from: string, to: string): Promise<Plan> {
  const res = await app.inject({ method: "POST", url: "/v1/routes", payload: { from: at(from), to: at(to) } });
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
