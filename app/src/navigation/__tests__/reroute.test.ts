import { describe, expect, it, vi } from "vitest";

import { NoAnswerRouteError, NoSignalRouteError, RouteError } from "../../api/routes";
import { planningText, STILL_PLANNING_MS } from "../planning";
import { offRouteText, rerouteFailure } from "../reroute";

vi.mock("../../config", () => ({ API_URL: "https://server.test", DEMO_MODE: false }));

describe("off-route panel", () => {
  it("says no signal and that the route may be stale only when the network failed", () => {
    const text = offRouteText(rerouteFailure(new NoSignalRouteError()), 10);
    expect(text.title).toBe("No signal");
    expect(text.detail).toMatch(/Route may be stale/);
  });

  it("doesn't call a slow server no signal", () => {
    const text = offRouteText(rerouteFailure(new NoAnswerRouteError()), 10);
    expect(text.title).toBe("Off route");
    expect(`${text.title} ${text.detail}`).not.toMatch(/signal/i);
  });

  it("tells other failures apart, and says it's working while it is", () => {
    expect(offRouteText(rerouteFailure(new RouteError("No route found to there.")), 10).title).toBe("Off route");
    expect(offRouteText(null, 10).detail).toMatch(/Finding a new route/);
    expect(offRouteText(null, 10, STILL_PLANNING_MS).detail).toMatch(/Still planning/);
  });
});

describe("planningText", () => {
  it("says 'still planning' from 4 s, not before", () => {
    for (const stage of ["routes", "blue-light", "reroute"] as const) {
      expect(planningText(stage, STILL_PLANNING_MS - 1)).not.toMatch(/^Still/);
      expect(planningText(stage, STILL_PLANNING_MS)).toMatch(/^Still/);
    }
    expect(STILL_PLANNING_MS).toBe(4000);
  });

  it("never blames the signal while waiting", () => {
    for (const stage of ["routes", "blue-light", "reroute"] as const) {
      expect(planningText(stage, 60_000)).not.toMatch(/signal/i);
    }
  });
});
