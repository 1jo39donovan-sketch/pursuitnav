import { describe, expect, it } from "vitest";

import { nearestHouseNumber } from "../mapShared";

const f = (n: string | number, lng: number, lat: number) => ({
  properties: { housenumber: n },
  geometry: { type: "Point" as const, coordinates: [lng, lat] },
});

describe("house number at a tap", () => {
  it("takes the number drawn nearest the tap", () => {
    const at: [number, number] = [-0.117, 51.5463];
    expect(nearestHouseNumber([f("56", -0.11695, 51.5463), f("54", -0.11701, 51.5463)], at)).toBe("54");
    expect(nearestHouseNumber([f(12, -0.117, 51.5463)], at)).toBe("12");
    expect(nearestHouseNumber([], at)).toBeNull();
  });
});
