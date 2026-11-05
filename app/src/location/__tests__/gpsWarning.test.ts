import { describe, expect, it } from "vitest";

import { gpsWarning } from "../gpsWarning";
import type { Fix } from "../LocationProvider";

/** One fix a second with these accuracies (null: unknown). */
const fixes = (acc: (number | null)[]): Fix[] =>
  acc.map((accuracy, i) => ({ lat: 51.5, lng: -0.1, accuracy, speed: null, course: null, timestamp: i * 1000 }));

describe("GPS warning timing", () => {
  it("doesn't warn for a few loose readings", () => {
    expect(gpsWarning(fixes([10, 80, 80, 80, 80, 10]), 50)).toBe(false);
  });

  it("warns once readings have been poor for 5 seconds", () => {
    expect(gpsWarning(fixes([80, 80, 80, 80, 80]), 50)).toBe(false); // 4 s
    expect(gpsWarning(fixes([80, 80, 80, 80, 80, 80]), 50)).toBe(true); // 5 s
  });

  it("stays up until 3 seconds of good readings", () => {
    const poor = [80, 80, 80, 80, 80, 80];
    expect(gpsWarning(fixes([...poor, 10, 10, 10]), 50)).toBe(true); // good for 2 s
    expect(gpsWarning(fixes([...poor, 10, 10, 10, 10]), 50)).toBe(false); // good for 3 s: gone
  });

  it("uses the higher line on a route", () => {
    const seventy = Array(7).fill(70);
    expect(gpsWarning(fixes(seventy), 50)).toBe(true);
    expect(gpsWarning(fixes(seventy), 100)).toBe(false);
  });

  it("counts unknown accuracy as poor", () => {
    expect(gpsWarning(fixes(Array(6).fill(null)), 50)).toBe(true);
  });
});
