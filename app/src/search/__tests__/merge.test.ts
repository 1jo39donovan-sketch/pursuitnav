import { describe, expect, it } from "vitest";

import type { Borough } from "../boroughs";
import type { SearchResult } from "../engine";
import { mergeAddresses } from "../merge";
import type { Address } from "../../api/addresses";

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
        {
          uprn: "1",
          label: "54 Caledonian Road",
          postcode: "N7 8LA",
          borough: "Islington",
          lat: 51.5441,
          lng: -0.1171,
          match: 1,
        },
        {
          uprn: "2",
          label: "54 Caledonian Road",
          postcode: "XX1 1XX",
          borough: "Haringey",
          lat: 51.58,
          lng: -0.1,
          match: 0.9,
        },
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
    expect(merged).toEqual({ inArea: [], outside: [], outsideCount: 0 });
  });

  const server = (over: Partial<Address>): Address => ({
    id: "osm:W1",
    source: "osm",
    precision: "door",
    label: "53 Caledonian Road",
    postcode: "",
    borough: "Islington",
    lat: 51.5441,
    lng: -0.1171,
    match: 0.5,
    ...over,
  });

  it("keeps the server's precision and id, and ranks door, postcode, road, place above the phone's matches", () => {
    const merged = mergeAddresses(
      { inArea: [road], outside: [] },
      [
        server({ id: "os-names:p", source: "os-names", precision: "place", label: "King's Cross" }),
        server({ id: "os-names:r", source: "os-names", precision: "road", label: "Caledonian Road, N7" }),
        server({ id: "os-names:pc", source: "os-names", precision: "postcode", label: "N7 8LA", postcode: "N7 8LA" }),
        server({}),
      ],
      new Set<Borough>(["Islington"]),
    );
    expect(merged.inArea.map((r) => [r.key, r.precision, r.kind])).toEqual([
      ["osm:W1", "door", "address"],
      ["os-names:pc", "postcode", "postcode"],
      ["os-names:r", "road", "address"],
      ["os-names:p", "place", "address"],
      [road.key, "road", "road"],
    ]);
    expect(merged.inArea[0]!.detail).toBe("Islington");
  });

  it("keeps a numbered address found only as its road at road precision", () => {
    const merged = mergeAddresses(
      { inArea: [], outside: [] },
      [server({ id: "osm:W9", precision: "road", label: "54 Caledonian Road" })],
      new Set<Borough>(["Islington"]),
    );
    expect(merged.inArea[0]).toMatchObject({ label: "54 Caledonian Road", precision: "road" });
  });

  it("still splits each precision by the officer's boroughs", () => {
    const merged = mergeAddresses(
      { inArea: [], outside: [] },
      [
        server({ id: "a", precision: "road", label: "Stroud Green Road", borough: "Islington" }),
        server({ id: "b", precision: "road", label: "Stroud Green Road", borough: "Haringey", lat: 51.58 }),
        server({
          id: "c",
          precision: "postcode",
          label: "N4 3EF",
          postcode: "N4 3EF",
          borough: "Haringey",
          lat: 51.58,
        }),
      ],
      new Set<Borough>(["Islington"]),
    );
    expect(merged.inArea.map((r) => r.key)).toEqual(["a"]);
    expect(merged.outside.map((r) => r.key)).toEqual(["c", "b"]);
  });
});
