import { describe, expect, it } from "vitest";

import type { Maneuver, Route } from "../../api/routes";
import { maneuverArrow, offRouteCount, prepare, progressAt } from "../progress";

// An L-shaped route: 500 m east, then right (south) 300 m.
// ~0.00719° of longitude is 500 m at this latitude; 0.0027° of latitude is 300 m.
const LAT = 51.54;
const LNG = -0.11;
const shape: [number, number][] = [
  [LNG, LAT],
  [LNG + 0.003595, LAT],
  [LNG + 0.00719, LAT],
  [LNG + 0.00719, LAT - 0.00135],
  [LNG + 0.00719, LAT - 0.0027],
];
const m = (type: number, instruction: string, street: string, begin: number, end: number, lengthM: number, timeS: number): Maneuver => ({
  type,
  instruction,
  streetNames: [street],
  lengthM,
  timeS,
  beginShapeIndex: begin,
  endShapeIndex: end,
});
const route: Route = {
  durationS: 80,
  distanceM: 800,
  shape,
  maneuvers: [
    m(1, "Drive east on Upper Street.", "Upper Street", 0, 2, 500, 50),
    m(10, "Turn right onto Islington Green.", "Islington Green", 2, 4, 300, 30),
    m(4, "You have arrived at your destination.", "", 4, 4, 0, 0),
  ],
};
const prepared = prepare(route);
const at = (lng: number, lat: number) => ({ lng, lat });

describe("progressAt", () => {
  it("knows the next turn and the distance to it from the start", () => {
    const p = progressAt(prepared, at(LNG, LAT));
    expect(p.current.streetNames).toEqual(["Upper Street"]);
    expect(p.next?.instruction).toBe("Turn right onto Islington Green.");
    expect(p.distanceToNextM).toBeCloseTo(500, -1);
    expect(p.remainingM).toBeCloseTo(800, -1);
    expect(p.remainingS).toBeCloseTo(80, 0);
    expect(p.arrived).toBe(false);
  });

  it("counts down along the road, snapping a fix just off the line", () => {
    const p = progressAt(prepared, at(LNG + 0.00539, LAT + 0.00009)); // 375 m along, 10 m north
    expect(p.offRouteBy).toBeCloseTo(10, 0);
    expect(p.distanceToNextM).toBeCloseTo(125, -1);
    expect(p.remainingS).toBeCloseTo(12.5 + 30, 0);
  });

  it("moves on to the next manoeuvre after the turn", () => {
    const p = progressAt(prepared, at(LNG + 0.00719, LAT - 0.0009), 2); // 100 m into the second leg
    expect(p.current.instruction).toBe("Turn right onto Islington Green.");
    expect(p.next?.type).toBe(4);
    expect(p.distanceToNextM).toBeCloseTo(200, -1);
  });

  it("arrives within 30 m of the end", () => {
    expect(progressAt(prepared, at(LNG + 0.00719, LAT - 0.0026), 3).arrived).toBe(true);
  });

  it("measures how far off the route a fix is", () => {
    const p = progressAt(prepared, at(LNG + 0.002, LAT + 0.0009)); // 100 m north of the first leg
    expect(p.offRouteBy).toBeCloseTo(100, -1);
  });
});

describe("offRouteCount", () => {
  it("counts consecutive off-route fixes and resets when back on", () => {
    expect(offRouteCount(0, 60, 5)).toBe(1);
    expect(offRouteCount(1, 60, 5)).toBe(2);
    expect(offRouteCount(2, 10, 5)).toBe(0);
  });

  it("allows for poor GPS accuracy", () => {
    expect(offRouteCount(0, 60, 50)).toBe(0); // 60 m off with ±50 m accuracy isn't conclusive
    expect(offRouteCount(0, 90, 50)).toBe(1);
  });
});

describe("maneuverArrow", () => {
  it("draws the turn", () => {
    expect(maneuverArrow(10)).toBe("→");
    expect(maneuverArrow(15)).toBe("←");
    expect(maneuverArrow(26)).toBe("⟳");
    expect(maneuverArrow(8)).toBe("↑");
  });
});
