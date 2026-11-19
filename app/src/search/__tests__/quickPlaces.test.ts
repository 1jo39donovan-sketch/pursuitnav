import { describe, expect, it, vi } from "vitest";

import { parseFavourites, toggled } from "../favourites";
import type { PointOfInterest } from "../places";
import { aeDestination, quickPlaces } from "../quickPlaces";

vi.mock("../../storage/store", () => ({ store: { getSetting: () => null, setSetting: () => {} } }));

const poi = (name: string, type: string, borough: string, lat: number, lng: number): PointOfInterest =>
  ({ name, type, borough, lat, lng, group: "emergency", otherNames: [], address: "" }) as PointOfInterest;

const pois = [
  poi("Whittington Hospital", "Hospital with A&E", "Islington", 51.5656, -0.1387),
  poi("Royal London Hospital", "Hospital with A&E", "Tower Hamlets", 51.5186, -0.0598),
  poi("Holborn Police Station", "Police station", "Camden", 51.5196, -0.1196),
  poi("Islington Police Station", "Police station", "Islington", 51.5412, -0.1036),
  poi("Islington Fire Station", "Fire station", "Islington", 51.5328, -0.1062),
];
const holloway = { lat: 51.555, lng: -0.115 };

describe("quick places", () => {
  it("gives police the nearest A&E, custody suite and police station", () => {
    const q = quickPlaces("police", holloway, pois);
    expect(q.map((p) => [p.label, p.place.name])).toEqual([
      ["Nearest A&E", "Whittington Hospital"],
      ["Nearest custody", "Islington custody"],
      ["Nearest police station", "Holborn Police Station"],
    ]);
  });

  it("gives fire crews their station and no custody", () => {
    const q = quickPlaces("fire", holloway, pois);
    expect(q.map((p) => p.label)).toEqual(["Nearest A&E", "Nearest fire station"]);
  });

  it("needs a position", () => {
    expect(quickPlaces("police", null, pois)).toEqual([]);
  });
});

describe("A&E", () => {
  it("never offers a mental health unit as the nearest A&E", () => {
    const unit = poi("Highgate Mental Health Centre", "Hospital with A&E", "Camden", 51.5552, -0.1155);
    expect(quickPlaces("ambulance", holloway, [unit, ...pois])[0]).toMatchObject({ place: { name: "Whittington Hospital" } });
  });

  it("sends a crew to the A&E entrance when one is mapped near the hospital", () => {
    const hospital = pois[0]!;
    const entrance = poi("Emergency Department", "A&E entrance", "Islington", 51.5662, -0.1379);
    expect(aeDestination(hospital, [...pois, entrance])).toMatchObject({
      name: "Whittington Hospital (A&E entrance)",
      lat: 51.5662,
    });
    // One by another hospital doesn't count.
    expect(aeDestination(pois[1]!, [...pois, entrance])).toBe(pois[1]);
  });
});

describe("favourites", () => {
  it("stars at the top and unstars the same place", () => {
    const a = { name: "Holborn custody", lat: 51.5196, lng: -0.1196, borough: "Camden" };
    const b = { name: "Whittington", lat: 51.5656, lng: -0.1387, borough: "Islington" };
    const list = toggled(toggled([], a), b);
    expect(list.map((f) => f.name)).toEqual(["Whittington", "Holborn custody"]);
    expect(toggled(list, { ...a, lat: a.lat + 0.00001 }).map((f) => f.name)).toEqual(["Whittington"]);
  });

  it("ignores a damaged list", () => {
    expect(parseFavourites("not json")).toEqual([]);
    expect(parseFavourites('[{"name":"x","lat":1,"lng":2},{"bad":true}]')).toHaveLength(1);
  });
});

describe("Nearest A&E that isn't for children (Ealing, checked 19 Nov)", () => {
  it("says so, and adds the nearest A&E that takes children", async () => {
    const { quickPlaces } = await import("../quickPlaces");
    const ealing = poi("Ealing Hospital", "Hospital with A&E", "Ealing", 51.5079, -0.3452);
    const northwick = poi("Northwick Park Hospital", "Hospital with A&E", "Harrow", 51.5755, -0.3218);
    const q = quickPlaces("ambulance", { lat: 51.51, lng: -0.34 }, [ealing, northwick]);
    expect(q[0]).toMatchObject({ label: "Nearest A&E", note: "Adults only: no children's A&E here." });
    expect(q[0]!.place.name).toBe("Ealing Hospital");
    expect(q[1]).toMatchObject({ label: "Nearest A&E for children" });
    expect(q[1]!.place.name).toBe("Northwick Park Hospital");
    // Elsewhere, one A&E line and no note.
    const there = quickPlaces("ambulance", { lat: 51.575, lng: -0.32 }, [ealing, northwick]);
    expect(there.filter((x) => x.label.startsWith("Nearest A&E"))).toHaveLength(1);
    expect(there[0]!.note).toBeUndefined();
  });
});

describe("custody outside London", () => {
  it("knows Kent's and Essex's suites, matched to their police stations", async () => {
    const { CUSTODY_SUITES, custodyStation } = await import("../../area/custody");
    const margate = CUSTODY_SUITES.find((c) => c.name === "Margate")!;
    const southend = CUSTODY_SUITES.find((c) => c.name === "Southend")!;
    expect([margate.borough, southend.borough]).toEqual(["Thanet", "Southend-on-Sea"]);
    const station = poi("Margate Police Station", "Police station", "Thanet", 51.385, 1.381);
    expect(custodyStation(margate, [station])).toBe(station);
    // Not a building in the wrong district.
    expect(custodyStation(southend, [poi("Southend Road Police Office", "Police station", "Havering", 51.57, 0.18)])).toBeNull();
    // Essex's open suites only (checked 19 Nov 2026): Basildon and Clacton
    // closed, Grays not confirmed open.
    const essex = CUSTODY_SUITES.filter((c) => c.agency === "Essex").map((c) => c.name);
    expect(essex).toEqual(["Chelmsford", "Colchester", "Harlow", "Southend"]);
    expect(CUSTODY_SUITES.filter((c) => c.agency === "Kent").map((c) => c.name)).toContain("North Kent (Northfleet)");
  });
});

describe("nearest police station", () => {
  it("is a station with a front counter, not a ward office nearer by", async () => {
    const { quickPlaces } = await import("../quickPlaces");
    const here = { lat: 51.5532, lng: -0.1154 };
    const office = poi("Metropolitan Police ward office", "Police station", "Islington", 51.5533, -0.1155);
    const station = poi("Holloway Police Station", "Police station", "Islington", 51.556, -0.12);
    const q = quickPlaces("police", here, [office, station]);
    expect(q.find((x) => /police station/i.test(x.label))?.place.name).toMatch(/Holloway/);
  });
});

