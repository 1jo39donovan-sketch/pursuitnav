import { describe, expect, it, vi } from "vitest";

import {
  NoAnswerRouteError,
  ServerDownRouteError,
  NoSignalRouteError,
  RouteError,
  type PoliceRoute,
  type Route,
  type RoutePlan,
} from "../../api/routes";
import { chooseRoute } from "../NavigationProvider";
import { planningText, STILL_PLANNING_MS } from "../planning";
import {
  NEXT_AFTER_SUCCESS_MS,
  offRouteText,
  policeReroute,
  RETRY_AFTER_FAILURE_MS,
  rerouteAllowed,
  rerouteFailure,
} from "../reroute";

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
    // The server failing mid-drive: the same as no answer, follow the last route.
    expect(rerouteFailure(new ServerDownRouteError())).toBe("no-answer");
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

describe("re-route timing", () => {
  it("allows the next re-route 3 s after a success", () => {
    const last = { at: 1000, ok: true };
    expect(rerouteAllowed(last, 1000 + NEXT_AFTER_SUCCESS_MS - 1)).toBe(false);
    expect(rerouteAllowed(last, 1000 + NEXT_AFTER_SUCCESS_MS)).toBe(true);
    expect(NEXT_AFTER_SUCCESS_MS).toBe(3000);
  });

  it("waits 10 s after a failure", () => {
    const last = { at: 1000, ok: false };
    expect(rerouteAllowed(last, 1000 + NEXT_AFTER_SUCCESS_MS)).toBe(false);
    expect(rerouteAllowed(last, 1000 + RETRY_AFTER_FAILURE_MS - 1)).toBe(false);
    expect(rerouteAllowed(last, 1000 + RETRY_AFTER_FAILURE_MS)).toBe(true);
    expect(RETRY_AFTER_FAILURE_MS).toBe(10_000);
  });

  it("goes at once the first time, and when asked for", () => {
    expect(rerouteAllowed(null, 0)).toBe(true);
    expect(rerouteAllowed({ at: 1000, ok: false }, 1001, true)).toBe(true);
  });
});

describe("blue-light re-route", () => {
  const standard: Route = { durationS: 600, distanceM: 4000, shape: [], maneuvers: [] };
  const police: PoliceRoute = {
    ...standard,
    durationS: 480,
    savingS: 120,
    restrictions: [],
    restrictionsComplete: true,
  };
  const deferred = <T>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
    return { promise, resolve, reject };
  };

  it("shows the standard route first, then the police route", async () => {
    const quick = deferred<RoutePlan>();
    const full = deferred<RoutePlan>();
    const seen: string[] = [];
    const done = policeReroute(
      (standardOnly) => (standardOnly ? quick.promise : full.promise),
      (plan, stage) => seen.push(`${stage}:${plan.police ? "police" : "standard"}`),
    );
    quick.resolve({ standard, police: null, noPoliceReason: "not-checked" });
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual(["checking:standard"]);
    full.resolve({ standard, police });
    await done;
    expect(seen).toEqual(["checking:standard", "done:police"]);
  });

  it("never says there's no faster police route before the full plan has answered", async () => {
    const full = deferred<RoutePlan>();
    const notes: (string | undefined)[] = [];
    const done = policeReroute(
      (standardOnly) => (standardOnly ? Promise.resolve({ standard, police: null }) : full.promise),
      (plan, stage) => notes.push(chooseRoute("police", plan, stage).note),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(notes).toEqual(["Checking for a blue-light route…"]);
    full.resolve({ standard, police: null, noPoliceReason: "not-faster" });
    await done;
    expect(notes[1]).toMatch(/No faster police route/);
  });

  it("skips the quick route if the full plan beats it", async () => {
    const quick = deferred<RoutePlan>();
    const seen: string[] = [];
    await policeReroute(
      (standardOnly) => (standardOnly ? quick.promise : Promise.resolve({ standard, police })),
      (_plan, stage) => seen.push(stage),
    );
    quick.resolve({ standard, police: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(["done"]);
  });

  it("keeps the standard route if the blue-light check fails, and fails only if both do", async () => {
    const seen: RoutePlan[] = [];
    await policeReroute(
      (standardOnly) =>
        standardOnly ? Promise.resolve({ standard, police: null }) : Promise.reject(new NoAnswerRouteError()),
      (plan) => seen.push(plan),
    );
    expect(seen.at(-1)?.noPoliceReason).toBe("check-failed");
    await expect(
      policeReroute(
        () => Promise.reject(new NoSignalRouteError()),
        () => {},
      ),
    ).rejects.toBeInstanceOf(NoSignalRouteError);
  });
});
