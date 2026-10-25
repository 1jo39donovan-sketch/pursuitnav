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

  it("keeps the server's precision and id: doors and postcodes above the phone's matches, roads and places below", () => {
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
      [road.key, "road", "road"],
      ["os-names:r", "road", "road"],
      ["os-names:p", "place", "poi"],
    ]);
    expect(merged.inArea[0]!.detail).toBe("Islington");
  });

  it("doesn't list a road twice when the phone already has it in that borough", () => {
    const merged = mergeAddresses(
      { inArea: [{ ...road, road: "Caledonian Road" }], outside: [] },
      [
        server({ id: "os-names:r", source: "os-names", precision: "road", label: "Caledonian Road, N7" }),
        server({
          id: "os-names:c",
          source: "os-names",
          precision: "road",
          label: "Caledonian Road",
          borough: "Camden",
        }),
      ],
      new Set<Borough>(["Islington", "Camden"]),
    );
    expect(merged.inArea.map((r) => r.key)).toEqual([road.key, "os-names:c"]);
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

  it("shows each thing once: road sections, a postcode the phone also has, a road it found the door on", () => {
    const area = new Set<Borough>(["Islington"]);
    const phoneRoad: SearchResult = { ...road, key: "road:53", label: "53 Caledonian Road", road: "Caledonian Road" };
    const phonePostcode: SearchResult = {
      ...road,
      key: "pc:N78LA",
      label: "N7 8LA",
      detail: "Islington",
      kind: "postcode",
      precision: "postcode",
    };
    const at = { borough: "Islington", lat: 51.54, lng: -0.117, match: 1 };
    const server: Address[] = [
      { id: "osm:1", label: "53 Caledonian Road", postcode: "N1 9BU", precision: "door", ...at },
      { id: "os:pc", label: "N7 8LA", postcode: "N7 8LA", precision: "postcode", ...at },
      // Unnamed buildings along the road, from an older server.
      { id: "osm:2", label: "Caledonian Road", postcode: "", precision: "place", ...at },
      { id: "osm:3", label: "Caledonian Road", postcode: "", precision: "place", ...at },
      { id: "osm:4", label: "Cally Pool and Gym", postcode: "", precision: "place", ...at },
      { id: "osm:5", label: "Cally Pool and Gym", postcode: "", precision: "place", ...at },
    ];
    const merged = mergeAddresses({ inArea: [phoneRoad, phonePostcode], outside: [] }, server, area);
    // The door replaces the road it's on; the road's nameless buildings go.
    expect(merged.inArea.map((r) => [r.label, r.precision])).toEqual([
      ["53 Caledonian Road", "door"],
      ["N7 8LA", "postcode"],
      ["Cally Pool and Gym", "place"],
    ]);
  });

  it("puts a number estimated from the doors either side above the road, and drops the road row", () => {
    const merged = mergeAddresses(
      { inArea: [{ ...road, label: "368 Holloway Road", road: "Holloway Road" }], outside: [] },
      [
        {
          id: "osm:est-holloway-road-368",
          label: "368 Holloway Road (estimated next to 366)",
          precision: "road",
          postcode: "N7 6PA",
          borough: "Islington",
          lat: 51.556,
          lng: -0.117,
          match: 0.6,
        } as Address,
      ],
      new Set<Borough>(["Islington"]),
    );
    expect(merged.inArea.map((r) => r.label)).toEqual(["368 Holloway Road (estimated next to 366)"]);
  });
});
