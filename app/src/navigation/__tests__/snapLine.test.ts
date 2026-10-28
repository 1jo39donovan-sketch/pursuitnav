import { describe, expect, it } from "vitest";

import { snapToLine } from "../snapLine";

// An eastbound stretch of road along latitude 51.5.
const road: [number, number][] = [
  [-0.1, 51.5],
  [-0.098, 51.5],
];

describe("drawing the car on the road", () => {
  it("puts a position a few metres off onto the road, facing along it", () => {
    const p = snapToLine({ lat: 51.50015, lng: -0.099 }, road)!; // ~17 m north
    expect(p.lat).toBeCloseTo(51.5, 6);
    expect(p.lng).toBeCloseTo(-0.099, 6);
    expect(p.course).toBeCloseTo(90);
  });

  it("leaves a position well away from the road where it is", () => {
    expect(snapToLine({ lat: 51.5005, lng: -0.099 }, road)).toBeNull(); // ~55 m
  });

  it("leaves a car that has driven past the end of the stretch where it is", () => {
    expect(snapToLine({ lat: 51.5, lng: -0.0978 }, road)).toBeNull();
    expect(snapToLine({ lat: 51.5, lng: -0.099 }, null)).toBeNull();
  });
});
