import { describe, expect, it } from "vitest";

import { BCUS, bcuFor } from "../../search/boroughGroups";
import { BOROUGHS } from "../../search/boroughs";
import type { PointOfInterest } from "../../search/places";
import { CUSTODY_SUITES, custodyIn, custodyStation } from "../custody";

const station = (name: string, borough: PointOfInterest["borough"], type = "Police station"): PointOfInterest => ({
  name,
  otherNames: [],
  type,
  group: "emergency",
  borough,
  lat: 51.5,
  lng: -0.1,
  address: "",
});

describe("custody suites", () => {
  it("are all in real boroughs, and every BCU but one has at least one", () => {
    for (const c of CUSTODY_SUITES) expect(BOROUGHS).toContain(c.borough);
    const empty = BCUS.filter((b) => custodyIn(b.boroughs).length === 0).map((b) => b.code);
    expect(empty).toEqual([]);
  });

  it("lists 24/7 suites before contingency ones", () => {
    const cn = custodyIn(["Camden", "Islington"]).map((c) => `${c.name} ${c.kind}`);
    expect(cn).toEqual([
      "Holborn 24/7",
      "Islington 24/7",
      "Brewery Lane 24/7",
      "Kentish Town contingency",
      "Tottenham Court Road contingency",
    ]);
  });

  it("finds the suite among police stations in its borough, by whole words", () => {
    const places = [
      station("Islington Police Station", "Islington"),
      station("Holloway Police Station", "Islington"),
      station("Islington Town Hall", "Islington", "Town hall"),
      station("Wembley Police Station", "Brent"),
      station("Wembley Park BTP", "Brent"),
    ];
    const by = (name: string) => CUSTODY_SUITES.find((c) => c.name === name)!;
    expect(custodyStation(by("Islington"), places)?.name).toBe("Islington Police Station");
    expect(custodyStation(by("Wembley"), places)?.name).toBe("Wembley Police Station");
    expect(custodyStation(by("Wembley Park"), places)?.name).toBe("Wembley Park BTP");
    // Not mapped: searched for instead, never a guess.
    expect(custodyStation(by("Holborn"), places)).toBeNull();
    // The right name in the wrong borough isn't it.
    expect(custodyStation(by("Islington"), [station("Islington Police Station", "Camden")])).toBeNull();
  });

  it("picks the BCU most of the chosen boroughs are in", () => {
    expect(bcuFor(["Camden", "Islington", "Hackney"]).code).toBe("CN");
    expect(bcuFor(["Lambeth"]).code).toBe("AS");
  });
});
