import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchRoutes, NoAnswerRouteError, NoSignalRouteError, planRequests, RouteError, ServerDownRouteError } from "../routes";

vi.mock("../../config", () => ({ API_URL: "https://server.test", DEMO_MODE: false }));

const from = { lat: 51.5, lng: -0.1 };
const to = { lat: 51.51, lng: -0.11 };

describe("fetchRoutes", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits 30 s for a plan (not 8), then says the server didn't answer, not no signal", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const caught = fetchRoutes(from, to, "car").catch((e: unknown) => e);
    let settled = false;
    void caught.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(8000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(22_000);
    const err = await caught;
    expect(err).toBeInstanceOf(NoAnswerRouteError);
    expect((err as Error).message).not.toMatch(/signal/i);
  });

  it("says no signal when the network fails", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Network request failed");
    });
    const err = await fetchRoutes(from, to, "car").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoSignalRouteError);
    expect((err as Error).message).toMatch(/^No signal/);
  });

  it("marks a plan asked for before the tap, so the server doesn't count it", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ standard: {}, police: null }), { status: 200 });
    });
    const signal = new AbortController().signal;
    const pre = planRequests(from, to, { vehicle: "car", roads: "main", blueLight: true, signal, prefetch: true });
    await Promise.all([pre.quick, pre.full]);
    const tap = planRequests(from, to, { vehicle: "car", roads: "main", blueLight: false, signal });
    await tap.quick;
    expect(tap.full).toBeNull();
    expect(bodies.map((b) => [b.standardOnly ?? false, b.prefetch ?? false])).toEqual([
      [true, true],
      [false, true],
      [true, false],
    ]);
  });

  it("tells a server that's down from a reason about the route", async () => {
    // Caddy's answer while the API is restarting or down.
    vi.stubGlobal("fetch", async () => new Response("", { status: 502 }));
    expect(await fetchRoutes(from, to, "car").catch((e: unknown) => e)).toBeInstanceOf(ServerDownRouteError);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "routing-unavailable" }), { status: 503 }));
    expect(await fetchRoutes(from, to, "car").catch((e: unknown) => e)).toBeInstanceOf(ServerDownRouteError);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "no-route" }), { status: 422 }));
    expect(await fetchRoutes(from, to, "car").catch((e: unknown) => e)).not.toBeInstanceOf(ServerDownRouteError);
  });

  it("keeps the server's own reasons distinct from no signal", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "no-route" }), { status: 422 }));
    const err = await fetchRoutes(from, to, "car").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RouteError);
    expect(err).not.toBeInstanceOf(NoSignalRouteError);
    expect((err as Error).message).toBe("No route found to there.");
  });
});
