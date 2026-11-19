import { describe, expect, it } from "vitest";

import { pursuitInfo } from "../../src/pursuit.js";
import type { LocatedEdge, Matcher } from "../../src/valhalla.js";

// A road running south-east, a node 100 m on where Seven Sisters Road meets it.
const road = (o: Partial<LocatedEdge>): LocatedEdge => ({
  names: ["Holloway Road", "A1"],
  heading: 140,
  percentAlong: 0.5,
  lengthM: 200,
  shape: [
    [-0.116, 51.555],
    [-0.115, 51.5544],
  ],
  car: true,
  use: "road",
  ...o,
});

describe("Pursuit's next junction (19 Nov, Holloway Road)", () => {
  it("still looks for one when Valhalla returns nothing for the car's direction", async () => {
    const asked: (number | undefined)[] = [];
    const matcher: Matcher = {
      matchRoad: async () => ({ names: ["A1", "Holloway Road"], speedLimitKph: 32 }) as never,
      locate: async (point, heading) => {
        asked.push(heading);
        if (heading !== undefined) return []; // the miss seen on the live map
        const atCar = point[0] < -0.1155;
        return atCar
          ? [road({}), road({ heading: 320, shape: [[-0.115, 51.5544], [-0.116, 51.555]] })]
          : [road({ percentAlong: 1 }), road({ names: ["Seven Sisters Road"], heading: 30, percentAlong: 0 })];
      },
    };
    const info = await pursuitInfo(matcher, [
      [-0.1165, 51.5556],
      [-0.1157, 51.555],
    ]);
    expect(info.road).toBe("Holloway Road / A1");
    expect(info.nextJunction?.name).toBe("Seven Sisters Road");
    expect(asked.slice(0, 2)).toEqual([expect.any(Number), undefined]);
  });

  it("never takes the other carriageway, running against the car", async () => {
    const matcher: Matcher = {
      matchRoad: async () => ({ names: ["Holloway Road"], speedLimitKph: 32 }) as never,
      locate: async (_p, heading) => (heading !== undefined ? [] : [road({ heading: 320 })]),
    };
    const info = await pursuitInfo(matcher, [
      [-0.1165, 51.5556],
      [-0.1157, 51.555],
    ]);
    expect(info.nextJunction).toBeNull();
    expect(info.roadShape).toBeNull();
  });
});
