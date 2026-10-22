import { describe, expect, it } from "vitest";

import { demoFixAt, demoFixNow, setDemoPath } from "../demoDrive";

const MPH = 2.23694;

describe("demo drive", () => {
  it("never goes over 20 mph", () => {
    for (let s = 0; s < 600; s++) expect(demoFixAt(s).speed! * MPH).toBeLessThan(20);
  });

  it("starts on the route being navigated and stops at its end", () => {
    const route: [number, number][] = [
      [-0.1, 51.5],
      [-0.1, 51.501],
      [-0.099, 51.501],
    ];
    setDemoPath(route, 1_000);
    const first = demoFixNow(1_000);
    expect([first.lng, first.lat]).toEqual(route[0]);
    expect(first.course).toBeCloseTo(0, 0);
    const end = demoFixNow(1_000 + 3600_000);
    expect([end.lng, end.lat]).toEqual(route[2]);
    expect(end.speed).toBe(0);
    // Back on patrol afterwards.
    setDemoPath(null, 0);
    expect(demoFixNow(0).lat).toBeCloseTo(51.556, 3);
  });
});
