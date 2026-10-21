import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { bearerMatches, buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import { ValhallaError, type Route, type Router } from "../../src/valhalla.js";
import { UsageStore } from "../../src/usage.js";

const A = "a".repeat(32);
const B = "b".repeat(32);
const DAY = 86_400_000;
// A Monday, so weeks are easy to reason about.
const MON = Date.parse("2026-10-19T12:00:00Z");

const clock = (start: number) => {
  let t = start;
  return { now: () => t, set: (ms: number) => (t = ms) };
};

describe("UsageStore", () => {
  it("counts each install once a day, by version", () => {
    const c = clock(MON);
    const usage = new UsageStore(":memory:", c.now);
    usage.seen(A, "1.0.0");
    usage.seen(A, "1.0.0");
    usage.seen(B, "1.1.0");
    const today = usage.stats(1).days[0]!;
    expect(today.installs).toBe(2);
    expect(today.versions).toEqual({ "1.0.0": 1, "1.1.0": 1 });
  });

  it("ignores missing and malformed install IDs and versions", () => {
    const usage = new UsageStore(":memory:", () => MON);
    usage.seen(undefined, "1.0.0");
    usage.seen("not-an-id", "1.0.0");
    usage.seen(A, "1.0.0; DROP TABLE seen");
    expect(usage.stats(1).days[0]).toMatchObject({ installs: 1, versions: { unknown: 1 } });
  });

  it("counts unique installs per week across days", () => {
    const c = clock(MON);
    const usage = new UsageStore(":memory:", c.now);
    usage.seen(A, "1.0.0");
    c.set(MON + DAY);
    usage.seen(A, "1.0.0");
    usage.seen(B, "1.0.0");
    const s = usage.stats(2);
    expect(s.days.map((d) => d.installs)).toEqual([2, 1]);
    expect(s.weeks).toEqual([{ week: "2026-10-19", installs: 2 }]);
  });

  it("adds up the day's counts", () => {
    const usage = new UsageStore(":memory:", () => MON);
    usage.add("routes_planned");
    usage.add("routes_planned");
    usage.add("timeouts", 3);
    usage.add("pursuit_sessions", 0);
    expect(usage.stats(1).days[0]!.counts).toMatchObject({ routes_planned: 2, timeouts: 3, pursuit_sessions: 0 });
  });

  it("deletes a day's hashes and salt once the day is over, keeping its totals", () => {
    const c = clock(MON);
    const usage = new UsageStore(":memory:", c.now);
    usage.seen(A, "1.0.0");
    usage.seen(B, "1.1.0");
    expect(usage.held()).toEqual({ dayHashes: 2, weekHashes: 2, salts: 2 }); // today's and this week's
    c.set(MON + DAY);
    usage.rollup();
    // Monday's day hashes and salt are gone; the week is still being counted.
    expect(usage.held()).toEqual({ dayHashes: 0, weekHashes: 2, salts: 1 });
    expect(usage.stats(2).days[1]).toMatchObject({ day: "2026-10-19", installs: 2, versions: { "1.0.0": 1, "1.1.0": 1 } });
  });

  it("deletes a week's hashes and salt once the week is over, keeping its total", () => {
    const c = clock(MON);
    const usage = new UsageStore(":memory:", c.now);
    usage.seen(A, "1.0.0");
    c.set(MON + 3 * DAY);
    usage.seen(A, "1.0.0");
    usage.seen(B, "1.0.0");
    c.set(MON + 7 * DAY); // the next Monday
    usage.rollup();
    expect(usage.held()).toEqual({ dayHashes: 0, weekHashes: 0, salts: 0 });
    const s = usage.stats(8);
    expect(s.weeks.find((w) => w.week === "2026-10-19")?.installs).toBe(2);
    expect(s.days.find((d) => d.day === "2026-10-22")?.installs).toBe(2);
  });

  it("can't link one install from one day to the next: a new salt each day", () => {
    const c = clock(MON);
    const usage = new UsageStore(":memory:", c.now);
    usage.seen(A, "1.0.0");
    const monday = usage.dayHashes();
    c.set(MON + DAY);
    usage.seen(A, "1.0.0");
    const tuesday = usage.dayHashes().filter((h) => !monday.includes(h));
    expect(tuesday).toHaveLength(1); // Tuesday's hash of the same install is a different value
    // Weekly uniques still count the install once.
    expect(usage.stats(2).weeks).toEqual([{ week: "2026-10-19", installs: 1 }]);
  });

  it("never stores the install ID itself", () => {
    const file = join(mkdtempSync(join(tmpdir(), "usage-")), "usage.sqlite");
    const usage = new UsageStore(file, () => MON);
    usage.seen(A, "1.0.0");
    usage.close();
    expect(readFileSync(file).includes(Buffer.from(A))).toBe(false);
  });
});

describe("bearerMatches", () => {
  it("accepts only the exact token", () => {
    expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
    expect(bearerMatches("bearer s3cret", "s3cret")).toBe(true);
    expect(bearerMatches("Bearer s3cre", "s3cret")).toBe(false);
    expect(bearerMatches("Bearer ", "s3cret")).toBe(false);
    expect(bearerMatches("s3cret", "s3cret")).toBe(false);
    expect(bearerMatches(undefined, "s3cret")).toBe(false);
  });
});

describe("usage API", () => {
  const route: Route = { durationS: 60, distanceM: 500, shape: [[-0.1, 51.5], [-0.11, 51.51]], maneuvers: [] };
  const router: Router = { route: async () => route, traceEdges: async () => [] };
  const config = {
    bounds: [-1, 51, 1, 52],
    placesFile: "/nonexistent",
    minSavingSeconds: 30,
    minSavingFraction: 0.05,
    restrictionCheckBudget: 10,
    statsToken: "s3cret",
  } as unknown as ServerConfig;
  const headers = { "x-install-id": A, "x-app-version": "1.0.0" };
  const trip = { from: { lat: 51.5, lng: -0.1 }, to: { lat: 51.51, lng: -0.11 } };

  const setup = (cfg = config) => {
    const usage = new UsageStore(":memory:");
    return { usage, app: buildApp(cfg, router, undefined, undefined, undefined, undefined, undefined, usage) };
  };

  it("counts a search once (the quick standard route isn't a second plan) and the install", async () => {
    const { usage, app } = setup();
    await app.inject({ method: "POST", url: "/v1/routes", headers, payload: { ...trip, standardOnly: true } });
    const full = await app.inject({ method: "POST", url: "/v1/routes", headers, payload: trip });
    expect(full.statusCode).toBe(200);
    const today = usage.stats(1).days[0]!;
    expect(today.counts.routes_planned).toBe(1);
    expect(today.installs).toBe(1);
  });

  it("counts failed plans", async () => {
    const { usage, app } = setup();
    await app.inject({ method: "POST", url: "/v1/routes", headers, payload: { ...trip, to: { lat: 10, lng: 10 } } });
    expect(usage.stats(1).days[0]!.counts.route_failures).toBe(1);
  });

  it("takes the app's own events, and nothing else", async () => {
    const { usage, app } = setup();
    const ok = await app.inject({
      method: "POST",
      url: "/v1/usage",
      headers,
      payload: { events: { navigation: 1, pursuit: 2, timeout: 3 } },
    });
    expect(ok.statusCode).toBe(200);
    expect(usage.stats(1).days[0]!.counts).toMatchObject({
      navigation_sessions: 1,
      pursuit_sessions: 2,
      timeouts: 3,
    });
    const extra = await app.inject({
      method: "POST",
      url: "/v1/usage",
      headers,
      payload: { events: { navigation: 1 }, lat: 51.5 },
    });
    expect(extra.statusCode).toBe(200);
    // Fields and event names it doesn't know are dropped, never stored.
    expect(usage.stats(1).days[0]!.counts.navigation_sessions).toBe(2);
    const before = usage.stats(1).days[0]!.counts;
    await app.inject({ method: "POST", url: "/v1/usage", payload: { events: { searches: 1 } } });
    expect(usage.stats(1).days[0]!.counts).toEqual(before);
    const tooMany = await app.inject({ method: "POST", url: "/v1/usage", payload: { events: { navigation: 5000 } } });
    expect(tooMany.statusCode).toBe(400);
  });

  it("doesn't count a feature that isn't set up as a server error, but does count a real failure", async () => {
    const { usage, app } = setup();
    // No OS Places key on this server: a deliberate 503.
    const off = await app.inject({ method: "POST", url: "/v1/addresses", headers, payload: { query: "54 Caledonian Road" } });
    expect(off.statusCode).toBe(503);
    expect(usage.stats(1).days[0]!.counts.server_errors).toBe(0);
    // The routing engine failing is a real server error.
    const failing: Router = {
      route: async () => {
        throw new ValhallaError("engine down", 503, undefined);
      },
      traceEdges: async () => [],
    };
    const usage2 = new UsageStore(":memory:");
    const app2 = buildApp(config, failing, undefined, undefined, undefined, undefined, undefined, usage2);
    const down = await app2.inject({ method: "POST", url: "/v1/routes", headers, payload: trip });
    expect(down.statusCode).toBe(503);
    expect(usage2.stats(1).days[0]!.counts.server_errors).toBe(1);
  });

  it("guards /stats with the bearer token", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "GET", url: "/stats" })).statusCode).toBe(401);
    const wrong = await app.inject({ method: "GET", url: "/stats", headers: { authorization: "Bearer nope" } });
    expect(wrong.statusCode).toBe(401);
    const right = await app.inject({ method: "GET", url: "/stats", headers: { authorization: "Bearer s3cret" } });
    expect(right.statusCode).toBe(200);
    expect(right.json()).toMatchObject({ days: expect.any(Array), weeks: expect.any(Array) });
  });

  it("is off without a STATS_TOKEN", async () => {
    const { app } = setup({ ...config, statsToken: undefined });
    const res = await app.inject({ method: "GET", url: "/stats", headers: { authorization: "Bearer anything" } });
    expect(res.statusCode).toBe(404);
  });
});

describe("CORS preflight", () => {
  it("lets the browser keep the answer, so a first request doesn't pay an extra round trip each time", async () => {
    const app = buildApp({ bounds: [-1, 51, 1, 52], placesFile: "/nonexistent" } as unknown as ServerConfig, {
      route: async () => ({}) as never,
      traceEdges: async () => [],
    });
    const res = await app.inject({
      method: "OPTIONS",
      url: "/v1/routes",
      headers: {
        origin: "https://example.github.io",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-install-id,x-app-version",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(Number(res.headers["access-control-max-age"])).toBeGreaterThanOrEqual(600);
    expect(String(res.headers["access-control-allow-headers"])).toContain("x-install-id");
  });
});
