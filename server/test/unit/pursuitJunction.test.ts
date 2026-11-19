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
      locate: async (point, heading, options) => {
        asked.push(heading);
        // The miss seen on the live map: the nearest road is a service road.
        if (heading !== undefined && !options?.publicRoads && point[0] < -0.1155) return [];
        const atCar = point[0] < -0.1155;
        return atCar
          ? [road({}), road({ heading: 320, shape: [[-0.115, 51.5544], [-0.116, 51.555]] })]
          : [
              road({ percentAlong: 1 }),
              // Starts at the junction node.
              road({ names: ["Seven Sisters Road"], heading: 30, percentAlong: 0, shape: [[-0.115, 51.5544], [-0.1145, 51.555]] }),
            ];
      },
    };
    const info = await pursuitInfo(matcher, [
      [-0.1165, 51.5556],
      [-0.1157, 51.555],
    ]);
    expect(info.road).toBe("Holloway Road / A1");
    expect(info.nextJunction?.name).toBe("Seven Sisters Road");
    // Asked with the direction, then again on public roads within 30 m.
    expect(asked.slice(0, 2)).toEqual([expect.any(Number), expect.any(Number)]);
  });

  it("never takes the other carriageway, running against the car", async () => {
    const matcher: Matcher = {
      matchRoad: async () => ({ names: ["Holloway Road"], speedLimitKph: 32 }) as never,
      locate: async () => [road({ heading: 320 })],
    };
    const info = await pursuitInfo(matcher, [
      [-0.1165, 51.5556],
      [-0.1157, 51.555],
    ]);
    expect(info.nextJunction).toBeNull();
    expect(info.roadShape).toBeNull();
  });

  it("steps past a stretch too short for Valhalla to tell its ends apart", async () => {
    // A 5 m stretch after the car's: asked about its far end, Valhalla answers
    // for the near one (no edge starting there), so look 8 m further on.
    const A: [number, number] = [-0.115, 51.5544];
    const B: [number, number] = [-0.11496, 51.55436]; // ~5 m on
    const C: [number, number] = [-0.1143, 51.5539];
    const matcher: Matcher = {
      matchRoad: async () => ({ names: ["Holloway Road"], speedLimitKph: 32 }) as never,
      locate: async (p, heading) => {
        const at = (q: [number, number]) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
        if (at([-0.1157, 51.555])) return [road({ shape: [[-0.116, 51.555], A], percentAlong: 0.5 })];
        if (at(A)) return [road({ shape: [A, B], percentAlong: 0, lengthM: 5 })];
        if (at(B)) return [road({ shape: [A, B], percentAlong: 0, lengthM: 5 })]; // snapped back to A
        if (heading !== undefined) return [road({ shape: [B, C], percentAlong: 0.1, lengthM: 90 })]; // 8 m past B
        if (at(C)) return [road({ shape: [B, C], percentAlong: 1 }), road({ names: ["Tollington Road"], heading: 60, percentAlong: 0, shape: [C, [-0.1135, 51.5542]] })];
        return [];
      },
    };
    const info = await pursuitInfo(matcher, [
      [-0.1165, 51.5556],
      [-0.1157, 51.555],
    ]);
    expect(info.nextJunction?.name).toBe("Tollington Road");
  });

  it("with no matched road, uses the road under the car (not named as its own junction)", async () => {
    const matcher: Matcher = {
      matchRoad: async () => ({ names: [], speedLimitKph: undefined }) as never,
      locate: async (p) =>
        p[0] < -0.1155
          ? [road({ names: ["Upper Street", "A1"] })]
          : [
              road({ names: ["Upper Street", "A1"], percentAlong: 1 }),
              road({ names: ["Upper Street", "A1"], percentAlong: 0, shape: [[-0.115, 51.5544], [-0.1145, 51.554]] }),
              road({ names: ["Islington Green"], heading: 60, percentAlong: 0, shape: [[-0.115, 51.5544], [-0.1145, 51.555]] }),
            ],
    };
    const info = await pursuitInfo(matcher, [
      [-0.1165, 51.5556],
      [-0.1157, 51.555],
    ]);
    expect(info.road).toBe("Upper Street / A1");
    expect(info.nextJunction?.name).toBe("Islington Green");
  });
});

