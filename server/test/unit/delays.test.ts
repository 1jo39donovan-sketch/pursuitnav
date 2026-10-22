import { describe, expect, it } from "vitest";

import { avoidingClosures, delaysOn, parseDelays, type Delay } from "../../src/closures.js";
import type { LngLat } from "../../src/geo.js";
// Three records from the live feed (20 October 2026). Powered by TfL Open Data.
import tflLive from "../fixtures/tfl-disruptions.json" with { type: "json" };
import type { Route, RouteRequest, Router } from "../../src/valhalla.js";

// A street running east at 51.5° N, and a parallel one 300 m north.
const MAIN: LngLat[] = Array.from({ length: 21 }, (_, i) => [-0.12 + i * 0.0005, 51.5]);
const NORTH: LngLat[] = MAIN.map(([lng]) => [lng, 51.5027]);
const HOLDUP = JSON.stringify([
  [-0.1150, 51.5],
  [-0.1120, 51.5],
]);
const NOW = new Date("2026-10-22T18:00:00Z");

const feedOf = (severity: string, closure = "Open") => [
  {
    id: "TIMS-9",
    status: "Active",
    severity,
    currentUpdate: "Eastbound traffic is slow moving with queues back to the junction.",
    streets: [{ name: "Main Road", closure, segments: [{ lineString: HOLDUP }] }],
  },
];

describe("parseDelays", () => {
  it("keeps Serious and Severe holdups on open streets, with TfL's update", () => {
    const [d] = parseDelays(feedOf("Serious"), NOW);
    expect(d).toMatchObject({ street: "Main Road", severity: "Serious", update: expect.stringMatching(/slow moving/) });
    expect(parseDelays(feedOf("Severe"), NOW)[0]!.severity).toBe("Severe");
    expect(parseDelays(feedOf("Moderate"), NOW)).toEqual([]);
  });

  it("uses TfL's point when the only street listed is closed (that's avoided as a closure)", () => {
    // The live sample: Serious works on Purley Way, with Waddon Road closed.
    const delays = parseDelays(tflLive, new Date("2026-10-20T18:00:00Z"));
    expect(delays).toHaveLength(1);
    expect(delays[0]).toMatchObject({ severity: "Serious", update: expect.stringMatching(/Purley Way/) });
    expect(delays[0]!.lines[0]).toEqual([[-0.117126, 51.371285]]);
  });

  it("finds a holdup on a route, not one on the next street", () => {
    const delays: Delay[] = parseDelays(feedOf("Serious"), NOW);
    expect(delaysOn(MAIN, delays)).toHaveLength(1);
    expect(delaysOn(NORTH, delays)).toHaveLength(0);
  });
});

describe("routing round holdups", () => {
  const route = (shape: LngLat[], durationS: number): Route => ({ durationS, distanceM: 1000, shape, maneuvers: [] });
  const req: RouteRequest = { costing: {} as never, from: { point: [-0.2, 51.6] }, to: { point: [-0.3, 51.6] } };
  const routerWith = (aroundS: number): Router => ({
    // Asked to avoid the holdup, the way round is the street to the north.
    route: async (r) => (r.avoidAreas?.length ? route(NORTH, aroundS) : route(MAIN, 600)),
    traceEdges: async () => [],
  });
  const feed = (severity: string) => {
    const delays = parseDelays(feedOf(severity), NOW);
    return { current: () => [], currentDelays: () => delays };
  };

  it("takes a cheap way round, and says what it avoided", async () => {
    const r = await avoidingClosures(routerWith(660), feed("Serious")).route(req);
    expect(r.shape).toBe(NORTH);
    expect(r).toMatchObject({ delaysAvoided: [{ street: "Main Road", severity: "Serious" }] });
  });

  it("keeps the route and warns when the way round costs too much", async () => {
    const r = await avoidingClosures(routerWith(1200), feed("Severe")).route(req);
    expect(r.shape).toBe(MAIN);
    expect(r).toMatchObject({ delays: [{ street: "Main Road", severity: "Severe" }] });
  });

  it("leaves restriction checks (distance only) alone", async () => {
    let calls = 0;
    const inner: Router = { route: async () => (calls++, route(MAIN, 600)), traceEdges: async () => [] };
    const r = await avoidingClosures(inner, feed("Serious")).route({ ...req, distanceOnly: true });
    expect(calls).toBe(1);
    expect(r).not.toHaveProperty("delays");
  });
});
