// Named places in search, with a small sample file in the server's format
// (server/places/extract_places.py). Borough indexes: 11 Hackney, 18 Islington.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { Borough } from "../boroughs";
import { parsePostcodes, parseRoads } from "../data";
import { SearchIndex } from "../engine";
import { starterEstatePlaces } from "../estates";
import { parsePlacesFile, typesForQuery } from "../places";

const SAMPLE = `#blueroute-places v1 2026-10-09 7
Coffee Corner||Coffee shop|food|18|5154660|-10350|12 Holloway Road, N7 8LA
Costa||Coffee shop|food|18|5153800|-10260|Upper Street
Costa||Coffee shop|food|18|5155500|-11500|
Dalston Beans||Coffee shop|food|11|5154600|-7500|
Nag's Head Food & Wine|Costcutter|Corner shop|shop|18|5155600|-11600|
Highbury Fields||Park|leisure|18|5154900|-10200|
Smith House||Block of flats|housing|18|5155200|-11300|
`;

const dataDir = join(__dirname, "..", "..", "..", "assets", "data");
let index: SearchIndex;
const ISLINGTON = new Set<Borough>(["Islington"]);
const top = (q: string) => index.search(q, ISLINGTON).inArea[0];

beforeAll(async () => {
  index = new SearchIndex(
    parseRoads(readFileSync(join(dataDir, "roads.dat"), "utf8")),
    parsePostcodes(readFileSync(join(dataDir, "postcodes.dat"), "utf8")),
  );
  index.setPlaces(starterEstatePlaces(index));
  await index.setPointsOfInterest(parsePlacesFile(SAMPLE).places);
});

describe("parsePlacesFile", () => {
  it("reads the header date and every place", () => {
    const file = parsePlacesFile(SAMPLE);
    expect(file.builtOn).toBe("2026-10-09");
    expect(file.places).toHaveLength(7);
    expect(file.places[0]).toMatchObject({ name: "Coffee Corner", type: "Coffee shop", group: "food", borough: "Islington" });
    expect(file.places[4]!.otherNames).toEqual(["Costcutter"]);
  });

  it("refuses something that isn't a places file", () => {
    expect(() => parsePlacesFile("<html>error</html>")).toThrow();
  });
});

describe("named places", () => {
  it("finds a business by name, tagged with its type", () => {
    expect(top("Coffee Corner")).toMatchObject({
      label: "Coffee Corner",
      kind: "poi",
      placeType: "Coffee shop",
      detail: "Coffee shop · Islington · 12 Holloway Road, N7 8LA",
    });
  });

  it("finds a place by another name (brand)", () => {
    expect(top("Costcutter")?.label).toBe("Nag's Head Food & Wine");
  });

  it("forgives misspellings", () => {
    expect(top("Highbery Fields")?.label).toBe("Highbury Fields");
  });

  it("ranks the branch near the road given with it first", () => {
    const hit = top("Costa, Upper Street")!;
    expect(hit.label).toBe("Costa");
    expect(hit.lat).toBeCloseTo(51.538, 3);
  });

  it("finds a named block, and still offers the road", () => {
    const labels = index.search("Smith House, Holloway Road", ISLINGTON).inArea.map((r) => r.label);
    expect(labels[0]).toBe("Smith House");
    expect(labels).toContain("Smith House, Holloway Road");
  });

  it("keeps addresses first when a house number is given", () => {
    expect(top("54 Caledonian Road")?.label).toBe("54 Caledonian Road");
  });
});

describe("listing a kind of place", () => {
  it("lists every coffee shop in the area, and others outside", () => {
    const { inArea, outside } = index.search("coffee shops", ISLINGTON);
    expect(inArea.filter((r) => r.placeType === "Coffee shop").map((r) => r.label).sort()).toEqual([
      "Coffee Corner",
      "Costa",
      "Costa",
    ]);
    expect(outside.map((r) => r.label)).toContain("Dalston Beans");
  });

  it("understands everyday words for places", () => {
    const types = new Set(["Coffee shop", "Corner shop", "Off-licence", "Place of worship", "Station"]);
    expect(typesForQuery("corner shops", types)).toEqual(["Corner shop"]);
    expect(typesForQuery("cafes", types)).toEqual(["Coffee shop"]);
    expect(typesForQuery("churches", types)).toEqual(["Place of worship"]);
    expect(typesForQuery("offie", types)).toEqual(["Off-licence", "Corner shop"]);
    expect(typesForQuery("Holloway Road", types)).toEqual([]);
  });
});
