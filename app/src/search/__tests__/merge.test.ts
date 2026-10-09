import { describe, expect, it } from "vitest";

import type { Borough } from "../boroughs";
import type { SearchResult } from "../engine";
import { mergeAddresses } from "../merge";

const road: SearchResult = {
  key: "road:Caledonian Road|Islington|54 Caledonian Road",
  label: "54 Caledonian Road",
  detail: "Islington · N1 N7",
  borough: "Islington",
  lat: 51.54,
  lng: -0.117,
  kind: "road",
  precision: "road",
  score: 100,
};

describe("mergeAddresses", () => {
  it("puts door-level addresses in the area first, and others outside", () => {
    const merged = mergeAddresses(
      { inArea: [road], outside: [] },
      [
        { uprn: "1", label: "54 Caledonian Road", postcode: "N7 8LA", borough: "Islington", lat: 51.5441, lng: -0.1171, match: 1 },
        { uprn: "2", label: "54 Caledonian Road", postcode: "XX1 1XX", borough: "Haringey", lat: 51.58, lng: -0.1, match: 0.9 },
      ],
      new Set<Borough>(["Islington"]),
    );
    expect(merged.inArea.map((r) => [r.kind, r.precision])).toEqual([
      ["address", "door"],
      ["road", "road"],
    ]);
    expect(merged.inArea[0]).toMatchObject({ detail: "Islington · N7 8LA", lat: 51.5441 });
    expect(merged.outside.map((r) => r.borough)).toEqual(["Haringey"]);
  });

  it("ignores addresses with a borough it doesn't know", () => {
    const merged = mergeAddresses(
      { inArea: [], outside: [] },
      [{ uprn: "1", label: "1 High Street", postcode: "AB1 2CD", borough: "Somewhere", lat: 0, lng: 0, match: 1 }],
      new Set<Borough>(["Islington"]),
    );
    expect(merged).toEqual({ inArea: [], outside: [] });
  });
});
