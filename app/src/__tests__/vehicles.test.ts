import { describe, expect, it } from "vitest";

import { SERVICES, VEHICLES, vehiclesFor } from "../vehicles";

describe("services and their vehicles", () => {
  it("offers each service its own vehicles", () => {
    expect(vehiclesFor("police")).toEqual(["car", "suv", "van", "carrier"]);
    expect(vehiclesFor("ambulance")).toEqual(["car", "ambulance"]);
    expect(vehiclesFor("fire")).toEqual(["car", "fire"]);
  });

  it("offers every vehicle before a service is chosen", () => {
    expect(vehiclesFor(null)).toEqual(VEHICLES.map((v) => v.id));
  });

  it("only names vehicles the routes know about", () => {
    const known = new Set<string>(VEHICLES.map((v) => v.id));
    for (const s of SERVICES) for (const v of s.vehicles) expect(known.has(v)).toBe(true);
  });
});
