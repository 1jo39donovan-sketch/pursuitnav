import { describe, expect, it } from "vitest";

import type { Maneuver, Route } from "../../api/routes";
import { briefInstruction, comingUp, maneuverArrow, offRouteCount, prepare, progressAt, thenText } from "../progress";

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
    // Gone past a turn: a little off the line and driving across the route counts double.
    expect(offRouteCount(0, 25, 8, 90)).toBe(2);
    expect(offRouteCount(2, 30, 8, 85)).toBe(4);
    // Along the route's direction, or close to the line: as before.
    expect(offRouteCount(0, 25, 8, 10)).toBe(0);
    expect(offRouteCount(0, 12, 8, 90)).toBe(0);
  });
});

describe("a missed turn, crawling in traffic", () => {
  // Drives on east past the right turn at 2.5 m/s (about 6 mph), a fix a
  // second with ±8 m GPS and no usable course, as on the 30 Oct drives.
  const secondsToOffRoute = (useTurn: boolean) => {
    const turnLng = LNG + 0.00719;
    const mPerDegLng = 111320 * Math.cos((LAT * Math.PI) / 180);
    let count = 0;
    let segment = 0;
    for (let t = 1; t <= 30; t++) {
      const p = progressAt(prepared, at(turnLng + (2.5 * t) / mPerDegLng, LAT), segment);
      segment = p.segment;
      count = offRouteCount(count, p.offRouteBy, 8, null, useTurn ? p.nearTurnM : Infinity);
      if (count >= 4) return t;
    }
    return Infinity;
  };

  it("is noticed within about 7 s of the junction, not 19 s", () => {
    expect(secondsToOffRoute(false)).toBeGreaterThanOrEqual(19);
    expect(secondsToOffRoute(true)).toBeLessThanOrEqual(7);
  });

  it("doesn't re-route a car waiting at the turn with GPS wandering a few metres", () => {
    let count = 0;
    for (let i = 0; i < 20; i++) {
      const p = progressAt(prepared, at(LNG + 0.00719 + (i % 2 ? 1 : -1) * 0.00012, LAT + 0.00005), 1);
      count = offRouteCount(count, p.offRouteBy, 8, null, p.nearTurnM);
    }
    expect(count).toBe(0);
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

describe("comingUp", () => {
  it("lists the turns after the next two, with how far each is from here", () => {
    const long = prepare({
      ...route,
      maneuvers: [
        m(1, "Drive east.", "A", 0, 1, 250, 25),
        m(9, "Bear right.", "B", 1, 2, 250, 25),
        m(10, "Turn right.", "C", 2, 3, 150, 15),
        m(15, "Turn left.", "D", 3, 4, 150, 15),
        m(4, "You have arrived.", "", 4, 4, 0, 0),
      ],
    });
    const p = progressAt(long, at(LNG, LAT));
    const ahead = comingUp(long, p);
    expect(ahead.map((a) => a.maneuver.instruction)).toEqual(["Turn left.", "You have arrived."]);
    expect(ahead[0]!.inM).toBeGreaterThan(640);
    expect(ahead[0]!.inM).toBeLessThan(660);
    // Near the end there's nothing more to read ahead.
    expect(comingUp(prepared, progressAt(prepared, at(LNG, LAT)))).toEqual([]);
  });
});

describe("drawing the vehicle on the route", () => {
  it("puts it on the line, facing along the road", async () => {
    const { pointAlong, prepare } = await import("../progress");
    const route = {
      shape: [
        [0, 51.5],
        [0, 51.501],
        [0.0016, 51.501],
      ],
      maneuvers: [],
      durationS: 60,
      distanceM: 220,
    } as never;
    const prepared = prepare(route);
    const north = pointAlong(prepared, 50)!;
    expect(north.lng).toBeCloseTo(0);
    expect(north.lat).toBeCloseTo(51.50045, 5);
    expect(north.course).toBeCloseTo(0);
    const east = pointAlong(prepared, 150)!;
    expect(east.lat).toBeCloseTo(51.501);
    expect(east.course).toBeCloseTo(90);
  });
});

describe("briefInstruction", () => {
  it("drops the trailing 'Continue on …' so the turn itself fits", async () => {
    const { briefInstruction } = await import("../progress");
    expect(briefInstruction("Turn left onto A501/Penton Rise. Continue on A501.")).toBe("Turn left onto Penton Rise.");
    expect(briefInstruction("Turn right onto Bedford Road/B221. Continue for 200 metres.")).toBe(
      "Turn right onto Bedford Road.",
    );
    expect(briefInstruction("Continue on A3.")).toBe("Continue on A3.");
  });
});

describe("short text for a glance", () => {
  it("shows the road's name, not its number, where it has both", () => {
    expect(briefInstruction("Keep left to take A203/South Lambeth Road.")).toBe("Keep left to take South Lambeth Road.");
    expect(briefInstruction("Turn right onto Wandsworth Road/A3036.")).toBe("Turn right onto Wandsworth Road.");
    expect(briefInstruction("Turn left onto A3.")).toBe("Turn left onto A3.");
  });

  it("makes the Then line the road alone, so it fits", () => {
    const turn = m(10, "Turn right onto Wandsworth Road/A3036.", "Wandsworth Road/A3036", 0, 1, 100, 10);
    expect(thenText(turn, turn.instruction)).toBe("Wandsworth Road");
    const numbered = { ...turn, streetNames: ["A3"] };
    expect(thenText(numbered, "Turn right onto A3.")).toBe("A3");
    const arrive = m(5, "Your destination is on the right.", "", 4, 4, 0, 0);
    expect(thenText({ ...arrive, streetNames: [] }, "Your destination is on the right: 54 Caledonian Road")).toBe(
      "Your destination is on the right: 54 Caledonian Road",
    );
  });
});
