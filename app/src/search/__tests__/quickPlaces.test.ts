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
