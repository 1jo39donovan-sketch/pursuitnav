import { describe, expect, it, vi } from "vitest";

import { NoSignalRouteError, RouteError } from "../../api/routes";
import { offRouteText, rerouteFailure } from "../reroute";

vi.mock("../../config", () => ({ API_URL: "https://server.test", DEMO_MODE: false }));

describe("off-route panel", () => {
  it("says no signal and that the route may be stale when the re-route timed out", () => {
    const text = offRouteText(rerouteFailure(new NoSignalRouteError()), 10);
    expect(text.title).toBe("No signal");
    expect(text.detail).toMatch(/Route may be stale/);
  });

  it("tells other failures apart, and says it's working while it is", () => {
    expect(offRouteText(rerouteFailure(new RouteError("No route found to there.")), 10).title).toBe("Off route");
    expect(offRouteText(null, 10).detail).toMatch(/Finding a new route/);
  });
});
