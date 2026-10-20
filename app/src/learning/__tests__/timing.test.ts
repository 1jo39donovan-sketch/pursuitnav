import { describe, expect, it } from "vitest";

import { bandAt, wayTimes } from "../timing";

// A straight 3 km route, one point every 100 m, driven at 10 m/s.
const cumulative = Array.from({ length: 31 }, (_, i) => i * 100);
const drive = (from = 0, to = 3000, start = Date.UTC(2026, 9, 20, 12)) =>
  Array.from({ length: (to - from) / 50 + 1 }, (_, i) => ({ along: from + i * 50, at: start + i * 5000 }));

describe("wayTimes", () => {
  it("times each way driven, in seconds", () => {
    const [s] = wayTimes([{ wayId: 9, beginShapeIndex: 10, endShapeIndex: 15 }], cumulative, drive());
    expect(s).toMatchObject({ w: 9, m: 500, s: 50 });
  });

  it("never uses the first or last 500 m of a drive", () => {
    const ways = [
      { wayId: 1, beginShapeIndex: 2, endShapeIndex: 8 },
      { wayId: 2, beginShapeIndex: 24, endShapeIndex: 28 },
    ];
    expect(wayTimes(ways, cumulative, drive())).toEqual([]);
  });

  it("trims from where the drive actually stopped, too", () => {
    // Navigation ended at 2 km on a 3 km route: 1.6–1.9 km is in the last 500 m driven.
    const ways = [{ wayId: 4, beginShapeIndex: 16, endShapeIndex: 19 }];
    expect(wayTimes(ways, cumulative, drive(0, 3000))).toHaveLength(1);
    expect(wayTimes(ways, cumulative, drive(0, 2000))).toEqual([]);
  });

  it("leaves out a way not driven all the way through, or with a gap in the fixes", () => {
    const ways = [{ wayId: 3, beginShapeIndex: 10, endShapeIndex: 15 }];
    expect(wayTimes(ways, cumulative, drive(0, 1200))).toEqual([]);
    const gappy = drive().filter((o) => o.along < 1100 || o.along > 1400);
    expect(wayTimes(ways, cumulative, gappy)).toEqual([]);
  });
});

describe("bandAt", () => {
  it("splits the week into night, rush hour and the rest", () => {
    expect(bandAt(new Date(2026, 9, 20, 23).getTime())).toBe("night");
    expect(bandAt(new Date(2026, 9, 20, 8).getTime())).toBe("peak");
    expect(bandAt(new Date(2026, 9, 24, 8).getTime())).toBe("day"); // Saturday
  });
});
