// Search behaviour against the real bundled data, covering every way the
// control room might give an address (see CLAUDE.md, "Address search").
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { Borough } from "../boroughs";
import { parsePostcodes, parseRoads } from "../data";
import { SearchIndex } from "../engine";
import { starterEstatePlaces } from "../estates";
import { parseQuery } from "../parse";
import { matchScore, normalise } from "../text";

const dataDir = join(__dirname, "..", "..", "..", "assets", "data");
let index: SearchIndex;
const ISLINGTON = new Set<Borough>(["Islington"]);

beforeAll(() => {
  index = new SearchIndex(
    parseRoads(readFileSync(join(dataDir, "roads.dat"), "utf8")),
    parsePostcodes(readFileSync(join(dataDir, "postcodes.dat"), "utf8")),
  );
  index.setPlaces(starterEstatePlaces(index));
});

const top = (q: string, area: ReadonlySet<Borough> = ISLINGTON) => index.search(q, area).inArea[0];

describe("roads", () => {
  it("finds Stroud Green Road under Islington", () => {
    expect(top("Stroud Green Road")).toMatchObject({ label: "Stroud Green Road", borough: "Islington" });
  });

  it("understands lower case and abbreviations", () => {
    expect(top("stroud green rd")).toMatchObject({ label: "Stroud Green Road", borough: "Islington" });
  });

  it("reads a leading St as Saint", () => {
    expect(normalise("St John St")).toBe("saint john street");
    expect(top("St John St")?.label).toBe("St John Street");
  });
});

describe("house numbers, flats and postcodes", () => {
  it("keeps the house number in the label", () => {
    expect(top("54 Caledonian Road")).toMatchObject({ label: "54 Caledonian Road", borough: "Islington" });
  });

  it("keeps the flat and number", () => {
    expect(top("Flat 3, 54 Caledonian Rd")?.label).toBe("Flat 3, 54 Caledonian Road");
  });

  it("finds a postcode on its own", () => {
    expect(top("N7 8LA")).toMatchObject({ label: "N7 8LA", kind: "postcode", borough: "Islington" });
    expect(top("n78la")?.label).toBe("N7 8LA");
  });

  it("uses a postcode on the end to place the address more closely", () => {
    const pc = index.postcode("N7 8LA")!;
    const hit = top("54 Caledonian Road, N7 8LA")!;
    expect(hit).toMatchObject({ label: "54 Caledonian Road", precision: "postcode" });
    expect(hit.lat).toBeCloseTo(pc.lat, 5);
  });

  it("lists the roads in an outward code", () => {
    const { inArea } = index.search("N7", ISLINGTON);
    expect(inArea.length).toBeGreaterThan(10);
    expect(inArea.map((r) => r.label)).toContain("Caledonian Road");
  });
});

describe("blocks and estates", () => {
  it("finds an estate by name", () => {
    expect(top("Bemerton Estate")).toMatchObject({ label: "Bemerton Estate", kind: "estate" });
  });

  it("finds Bemerton Estate from 'Bedminton Estate'", () => {
    expect(top("Bedminton Estate")).toMatchObject({ label: "Bemerton Estate", kind: "estate" });
  });

  it("keeps a block name given before the road", () => {
    expect(top("Smith House, Holloway Road")).toMatchObject({
      label: "Smith House, Holloway Road",
      borough: "Islington",
    });
  });

  it("includes the officer's saved places", () => {
    const road = index.findRoad("Holloway Road", "Islington")!;
    index.setPlaces([
      ...starterEstatePlaces(index),
      { id: 1, name: "Harvist Estate", road: "Holloway Road", borough: "Islington", lat: road.lat, lng: road.lng, kind: "saved" },
    ]);
    expect(top("harvist")).toMatchObject({ label: "Harvist Estate", kind: "saved", detail: "Islington · off Holloway Road" });
    index.setPlaces(starterEstatePlaces(index));
  });
});

describe("borough filter", () => {
  it("puts matches outside the selected boroughs behind 'outside your area'", () => {
    const { inArea, outside } = index.search("Stroud Green Road", new Set<Borough>(["Hackney"]));
    expect(inArea.find((r) => r.label === "Stroud Green Road")).toBeUndefined();
    expect(outside.map((r) => r.borough)).toContain("Islington");
  });

  it("separates same-named roads by borough", () => {
    const { inArea, outside } = index.search("Church Street", new Set<Borough>(["Westminster"]));
    expect(inArea[0]).toMatchObject({ label: "Church Street", borough: "Westminster" });
    expect(outside.length).toBeGreaterThan(3);
  });
});

describe("parseQuery", () => {
  it("splits flat, number, road and postcode", () => {
    expect(parseQuery("Flat 3, 54 Caledonian Rd, N7 8LA")).toEqual({
      flat: "Flat 3",
      number: "54",
      parts: ["Caledonian Rd"],
      postcode: "N7 8LA",
    });
  });

  it("handles number ranges and letters", () => {
    expect(parseQuery("54-56 Caledonian Road").number).toBe("54-56");
    expect(parseQuery("54a Caledonian Road").number).toBe("54A");
  });
});

describe("matchScore", () => {
  it("ranks exact over prefix over word over misspelling", () => {
    const n = normalise("Bemerton Estate");
    expect(matchScore(n, "bemerton estate")).toBeGreaterThan(matchScore(n, "bemerton"));
    expect(matchScore(n, "bemerton")).toBeGreaterThan(matchScore(n, "estate"));
    expect(matchScore(n, "estate")).toBeGreaterThan(matchScore(n, normalise("bedminton estate")));
    expect(matchScore(n, normalise("bedminton estate"))).toBeGreaterThan(0);
  });

  it("doesn't guess wildly", () => {
    expect(matchScore(normalise("Bemerton Estate"), "xyz")).toBe(0);
  });
});
