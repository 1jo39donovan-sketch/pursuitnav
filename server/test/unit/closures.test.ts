import { describe, expect, it } from "vitest";

import { avoidingClosures, boxesAlong, ClosureFeed, parseDisruptions } from "../../src/closures.js";
import type { LngLat } from "../../src/geo.js";
import { ValhallaError, type Route, type RouteRequest, type Router } from "../../src/valhalla.js";

// Shaped like TfL's /Road/all/Disruption (fields cut down; TfL sends many more).
const LINE = "[[-0.1000,51.5000],[-0.0970,51.5000]]";
const FEED = [
  {
    id: "TIMS-1",
    status: "Active",
    startDateTime: "2026-10-01T00:00:00Z",
    endDateTime: "2026-12-01T00:00:00Z",
    hasClosures: true,
    streets: [
      {
        name: "Upper Street",
        closure: "Full Closure",
        directions: "All Directions",
        segments: [{ toid: "x", lineString: LINE }],
      },
      { name: "Liverpool Road", closure: "Partial Closure", segments: [{ lineString: LINE }] },
      { name: "Essex Road", closure: "Open", segments: [{ lineString: LINE }] },
    ],
  },
  {
    id: "TIMS-2",
    status: "Scheduled",
    streets: [{ name: "A", closure: "Full Closure", segments: [{ lineString: LINE }] }],
  },
  {
    id: "TIMS-3",
    status: "Active",
    endDateTime: "2026-10-01T00:00:00Z",
    streets: [{ name: "Ended Road", closure: "Full Closure", segments: [{ lineString: LINE }] }],
  },
  { id: "TIMS-4", status: "Active Long Term", streets: [{ name: "No Line", closure: "Full Closure", segments: [{}] }] },
  {
    id: "TIMS-5",
    status: "Active Long Term",
    streets: [{ name: "Bad Line", closure: "Full Closure", segments: [{ lineString: "not json" }] }],
  },
  null,
];
const NOW = new Date("2026-10-20T12:00:00Z");

describe("parseDisruptions", () => {
  it("keeps only live full closures with a line to place them", () => {
    const closures = parseDisruptions(FEED, NOW);
    expect(closures.map((c) => c.street)).toEqual(["Upper Street"]);
    expect(closures[0]!.rings).toHaveLength(1);
  });

  it("reads a segment written as a whole GeoJSON LineString too", () => {
    const geojson = JSON.stringify({ type: "LineString", coordinates: JSON.parse(LINE) });
    const feed = [
      { id: "G", streets: [{ name: "Holloway Road", closure: "Full Closure", segments: [{ lineString: geojson }] }] },
    ];
    expect(parseDisruptions(feed, NOW).map((c) => c.street)).toEqual(["Holloway Road"]);
  });

  it("works with the stripped-down feed, which has no status", () => {
    const feed = [
      { id: "S", streets: [{ name: "Upper Street", closure: "Full Closure", segments: [{ lineString: LINE }] }] },
    ];
    expect(parseDisruptions(feed, NOW)).toHaveLength(1);
  });

  it("copes with something that isn't the feed", () => {
    expect(parseDisruptions({ message: "throttled" }, NOW)).toEqual([]);
  });
});

describe("boxesAlong", () => {
  it("is a closed ring kept off the junctions at each end", () => {
    const [ring] = boxesAlong([
      [-0.1, 51.5],
      [-0.097, 51.5],
    ]);
    expect(ring).toHaveLength(5);
    expect(ring![0]).toEqual(ring![4]);
    const lngs = ring!.map((p) => p[0]);
    expect(Math.min(...lngs)).toBeGreaterThan(-0.1);
    expect(Math.max(...lngs)).toBeLessThan(-0.097);
  });

  it("leaves out a stretch too short to trim", () => {
    expect(
      boxesAlong([
        [-0.1, 51.5],
        [-0.0997, 51.5],
      ]),
    ).toEqual([]);
  });
});

describe("ClosureFeed", () => {
  it("drops closures it hasn't been able to refresh for an hour", () => {
    const feed = new ClosureFeed();
    feed.set(parseDisruptions(FEED, NOW), NOW);
    expect(feed.summary(NOW).active).toBe(1);
    expect(feed.current(new Date(NOW.getTime() + 61 * 60_000))).toEqual([]);
  });

  it("asks TfL for the feed with the app key and nothing about the officer", async () => {
    const urls: string[] = [];
    const fake = (async (url: URL) => {
      urls.push(String(url));
      return new Response(JSON.stringify(FEED));
    }) as unknown as typeof fetch;
    const feed = new ClosureFeed("https://api.tfl.gov.uk/Road/all/Disruption", "KEY", 1000, fake);
    await feed.refresh();
    expect(urls).toEqual(["https://api.tfl.gov.uk/Road/all/Disruption?stripContent=true&app_key=KEY"]);
  });

  it("keeps the last good list when TfL fails", async () => {
    const feed = new ClosureFeed(undefined, undefined, 1000, (async () => new Response("", { status: 503 })) as never);
    feed.set(parseDisruptions(FEED, NOW));
    await feed.refresh();
    expect(feed.current()).toHaveLength(1);
  });
});

describe("avoidingClosures", () => {
  const route: Route = { durationS: 1, distanceM: 1, shape: [], maneuvers: [] };
  const far: LngLat = [-0.2, 51.5];
  const feed = { current: () => parseDisruptions(FEED, NOW) };

  it("adds the closures as areas to avoid", async () => {
    const seen: RouteRequest[] = [];
    const inner: Router = { route: async (r) => (seen.push(r), route), traceEdges: async () => [] };
    await avoidingClosures(inner, feed).route({
      costing: {} as never,
      from: { point: far },
      to: { point: [-0.25, 51.5] },
    });
    expect(seen[0]!.avoidAreas).toHaveLength(1);
  });

  it("leaves out a closure right by the destination", async () => {
    const seen: RouteRequest[] = [];
    const inner: Router = { route: async (r) => (seen.push(r), route), traceEdges: async () => [] };
    await avoidingClosures(inner, feed).route({
      costing: {} as never,
      from: { point: far },
      to: { point: [-0.0985, 51.5] },
    });
    expect(seen[0]!.avoidAreas).toBeUndefined();
  });

  it("routes without them, and says so, if they leave no way through", async () => {
    const inner: Router = {
      route: async (r) => {
        if (r.avoidAreas) throw new ValhallaError("no path", 400, 442);
        return route;
      },
      traceEdges: async () => [],
    };
    const r = await avoidingClosures(inner, feed).route({
      costing: {} as never,
      from: { point: far },
      to: { point: [-0.25, 51.5] },
    });
    expect(r).toMatchObject({ closuresIgnored: true });
  });
});
