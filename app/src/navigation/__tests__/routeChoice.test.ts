import { describe, expect, it } from "vitest";

import type { PoliceRoute, Route, RoutePlan } from "../../api/routes";
import {
  cardSlots,
  createTapGuard,
  planAgeText,
  planIsStale,
  slotKey,
  STALE_AFTER_MS,
  STALE_BEYOND_M,
  TAP_GUARD_MS,
} from "../routeChoice";

const standard: Route = { durationS: 600, distanceM: 4000, shape: [], maneuvers: [] };
const police: PoliceRoute = { ...standard, durationS: 480, savingS: 120, restrictions: [], restrictionsComplete: true };

describe("route cards", () => {
  const order = (plan: RoutePlan, checking: boolean) => cardSlots(plan, checking).map((s) => s.kind);

  it("keeps blue light left and standard right, whatever has arrived", () => {
    const checking = order({ standard, police: null, noPoliceReason: "not-checked" }, true);
    const both = order({ standard, police }, false);
    const noPolice = order({ standard, police: null, noPoliceReason: "not-faster" }, false);
    expect(checking).toEqual(["police", "standard"]);
    expect(both).toEqual(checking);
    expect(noPolice).toEqual(checking);
  });

  it("shows a placeholder while checking, and Fastest only once it's known", () => {
    const [p1, s1] = cardSlots({ standard, police: null }, true);
    expect(p1).toMatchObject({ state: "checking" });
    expect(s1.fastest).toBe(false);
    const [p2, s2] = cardSlots({ standard, police }, false);
    expect(p2).toMatchObject({ state: "route", fastest: true });
    expect(s2.fastest).toBe(false);
    const [p3, s3] = cardSlots({ standard, police: null, noPoliceReason: "wrong-way-unavoidable" }, false);
    expect(p3).toMatchObject({ state: "none", reason: "wrong-way-unavoidable" });
    expect(s3.fastest).toBe(true);
  });

  it("tells a placeholder from the route that replaces it", () => {
    const checking = cardSlots({ standard, police: null }, true).map(slotKey).join("|");
    const ready = cardSlots({ standard, police }, false).map(slotKey).join("|");
    expect(ready).not.toBe(checking);
  });
});

describe("tap guard", () => {
  it("ignores a Go tap within 400 ms of a card change", () => {
    const guard = createTapGuard();
    guard.see("police:checking", 0);
    expect(guard.allows(TAP_GUARD_MS)).toBe(true);
    guard.see("police:480", 1000); // the placeholder becomes a route
    expect(guard.allows(1000 + TAP_GUARD_MS - 1)).toBe(false);
    expect(guard.allows(1000 + TAP_GUARD_MS)).toBe(true);
    expect(TAP_GUARD_MS).toBe(400);
  });

  it("isn't reset by the same content showing again", () => {
    const guard = createTapGuard();
    guard.see("a", 0);
    guard.see("a", 1000);
    expect(guard.allows(1000)).toBe(true);
  });
});

describe("planIsStale", () => {
  const from = { lat: 51.5, lng: -0.1 };
  const plan = { madeAt: 0, from };
  // A point due north of `from`, this many metres away.
  const north = (m: number) => ({ lat: from.lat + m / 111_195, lng: from.lng });

  it("is fresh up to 20 s, stale after", () => {
    expect(planIsStale(plan, from, STALE_AFTER_MS)).toBe(false);
    expect(planIsStale(plan, from, STALE_AFTER_MS + 1)).toBe(true);
    expect(STALE_AFTER_MS).toBe(20_000);
  });

  it("is fresh up to 150 m from where it was made, stale beyond", () => {
    expect(planIsStale(plan, north(STALE_BEYOND_M - 1), 0)).toBe(false);
    expect(planIsStale(plan, north(STALE_BEYOND_M + 1), 0)).toBe(true);
    expect(STALE_BEYOND_M).toBe(150);
  });

  it("goes by age alone with no fix", () => {
    expect(planIsStale(plan, null, 1000)).toBe(false);
    expect(planIsStale(plan, null, STALE_AFTER_MS + 1)).toBe(true);
  });
});

describe("planAgeText", () => {
  it("says how old the routes are once older than 20 s", () => {
    expect(planAgeText(0, 20_000)).toBeNull();
    expect(planAgeText(0, 40_000)).toBe("Routes from 40 s ago");
    expect(planAgeText(0, 130_000)).toBe("Routes from 2 min ago");
  });
});
