import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchRoutes, NoSignalRouteError, RouteError } from "../routes";

vi.mock("../../config", () => ({ API_URL: "https://server.test", DEMO_MODE: false }));

const from = { lat: 51.5, lng: -0.1 };
const to = { lat: 51.51, lng: -0.11 };

describe("fetchRoutes", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("gives up after 8 s with a clear no-signal error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const caught = fetchRoutes(from, to, "car").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(8000);
    const err = await caught;
    expect(err).toBeInstanceOf(NoSignalRouteError);
    expect((err as Error).message).toMatch(/^No signal/);
  });

  it("keeps the server's own reasons distinct from no signal", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "no-route" }), { status: 422 }));
    const err = await fetchRoutes(from, to, "car").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RouteError);
    expect(err).not.toBeInstanceOf(NoSignalRouteError);
    expect((err as Error).message).toBe("No route found to there.");
  });
});
