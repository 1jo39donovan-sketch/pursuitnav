// Search behaviour against the real bundled data, covering every way the
// control room might give an address (see CLAUDE.md, "Address search").
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { nearBoroughs } from "../../area/area";
import type { Borough } from "../boroughs";
import { parsePostcodes, parseRoads, parseServerRoads } from "../data";
import { SearchIndex } from "../engine";
import { starterEstatePlaces } from "../estates";
import { expandNicknames } from "../nicknames";
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

  it("takes a number written after the road", () => {
    expect(top("Caledonian Road 54")).toMatchObject({ label: "54 Caledonian Road", borough: "Islington" });
    expect(top("Caledonian Rd, 54")?.label).toBe("54 Caledonian Road");
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

describe("nicknames", () => {
  it("finds Caledonian Road from 'Cally Road' and 'the Cally'", () => {
    expect(top("Cally Road")).toMatchObject({ label: "Caledonian Road", borough: "Islington" });
    expect(top("54 Cally Rd")).toMatchObject({ label: "54 Caledonian Road", borough: "Islington" });
    expect(top("the cally")).toMatchObject({ label: "Caledonian Road", borough: "Islington" });
  });

  it("spells out whole words only, and not what's already spelt out", () => {
    expect(expandNicknames("Cally Road")).toBe("Caledonian Road");
    expect(expandNicknames("Callywood Close")).toBeNull();
    expect(expandNicknames("Elephant and Castle")).toBeNull();
    expect(expandNicknames("the elephant")).toBe("Elephant and Castle");
    expect(expandNicknames("Stroud Green Road")).toBeNull();
  });

  it("doesn't add roads that are only spelt like the nickname", () => {
    const labels = index.search("Cally Road", ISLINGTON).inArea.map((r) => r.label);
    expect(labels).not.toContain("Celia Road");
    expect(labels).not.toContain("City Road");
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

  it("finds the number after the road", () => {
    expect(parseQuery("Caledonian Road 54, N7 8LA")).toEqual({ number: "54", parts: ["Caledonian Road"], postcode: "N7 8LA" });
    expect(parseQuery("Smith Street, 21a, Islington")).toEqual({ number: "21A", parts: ["Smith Street", "Islington"] });
    expect(parseQuery("Flat 3, Caledonian Rd 54").number).toBe("54");
    // A road whose name has a number in it is not a house number.
    expect(parseQuery("A406").number).toBeUndefined();
    expect(parseQuery("Caledonian Road").number).toBeUndefined();
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

describe("roads just over the borough line", () => {
  // Officers are often told the wrong borough for roads near a boundary.
  const islingtonAndNear = { has: (b: Borough) => b === "Islington", near: nearBoroughs(ISLINGTON, 500) };

  it("finds York Way, on the Camden–Islington border, with Islington picked", () => {
    expect(index.search("York Way", islingtonAndNear).inArea.map((r) => r.label)).toContain("York Way");
  });

  it("shows a Camden road just over the Islington line with Islington's results", () => {
    expect(index.search("Agar Grove", ISLINGTON).inArea.map((r) => r.borough)).not.toContain("Camden");
    const found = index.search("Agar Grove", islingtonAndNear).inArea.find((r) => r.label === "Agar Grove");
    expect(found?.borough).toBe("Camden");
  });

  it("still keeps roads well into the next borough outside", () => {
    expect(index.search("Kentish Town Road", islingtonAndNear).inArea).toEqual([]);
  });
});

describe("roads missing from the bundled list", () => {
  // Small Camden roads the OS-based bundled list doesn't have; the server's
  // OpenStreetMap list does (server/places/extract_roads.py).
  const SERVER_ROADS = `#blueroute-roads v1 2026-10-20 3
Mutton Place|5|5154460|-14740
Castle Mews|5|5154530|-14600
Harmood Street|5|5154438|-14725
`;
  const CAMDEN = new Set<Borough>(["Camden"]);

  it("finds Mutton Place and Camden's Castle Mews once the server's road list is added", () => {
    const fresh = new SearchIndex(
      parseRoads(readFileSync(join(dataDir, "roads.dat"), "utf8")),
      parsePostcodes(readFileSync(join(dataDir, "postcodes.dat"), "utf8")),
    );
    expect(fresh.search("Mutton Place", CAMDEN).inArea).toEqual([]);
    expect(fresh.search("Castle Mews", CAMDEN).inArea).toEqual([]);

    // Harmood Street is already listed, so only the two new ones are added.
    expect(fresh.addRoads(parseServerRoads(SERVER_ROADS))).toBe(2);
    expect(fresh.search("Mutton Place", CAMDEN).inArea[0]).toMatchObject({ label: "Mutton Place", borough: "Camden" });
    expect(fresh.search("Castle Mews", CAMDEN).inArea[0]).toMatchObject({ label: "Castle Mews", borough: "Camden" });
    // It's listed under its postcode district too.
    expect(fresh.search("NW1", CAMDEN).inArea.map((r) => r.label)).toContain("Mutton Place");
    // Adding the same list again adds nothing.
    expect(fresh.addRoads(parseServerRoads(SERVER_ROADS))).toBe(0);
  });
});
