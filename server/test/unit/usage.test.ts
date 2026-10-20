import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { bearerMatches, buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import type { Route, Router } from "../../src/valhalla.js";
import { KEEP_IDS_DAYS, UsageStore } from "../../src/usage.js";

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

  it("drops install IDs after 30 days but keeps the day and week totals", () => {
    const c = clock(MON);
    const usage = new UsageStore(":memory:", c.now);
    usage.seen(A, "1.0.0");
    usage.seen(B, "1.0.0");
    c.set(MON + DAY);
    usage.rollup();
    expect(usage.heldIds()).toBe(2);
    c.set(MON + (KEEP_IDS_DAYS + 1) * DAY);
    usage.rollup();
    expect(usage.heldIds()).toBe(0);
    const s = usage.stats(KEEP_IDS_DAYS + 2);
    expect(s.days.find((d) => d.day === "2026-10-19")?.installs).toBe(2);
    expect(s.weeks.find((w) => w.week === "2026-10-19")?.installs).toBe(2);
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
