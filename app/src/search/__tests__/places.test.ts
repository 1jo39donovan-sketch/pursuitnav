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

const SAMPLE = `#blueroute-places v1 2026-10-09 10
Coffee Corner||Coffee shop|food|18|5154660|-10350|12 Holloway Road, N7 8LA
Costa||Coffee shop|food|18|5153800|-10260|Upper Street
Costa||Coffee shop|food|18|5155500|-11500|
Dalston Beans||Coffee shop|food|11|5154600|-7500|
Nag's Head Food & Wine|Costcutter|Corner shop|shop|18|5155600|-11600|
Highbury Fields||Park|leisure|18|5154900|-10200|
Smith House||Block of flats|housing|18|5155200|-11300|
Angel||Station|transport|18|5153249|-10604|Islington High Street, N1 9LQ
Angel Curry Centre||Restaurant|food|18|5153300|-10620|
The Whittington Hospital||Hospital|health|18|5156656|-13935|Magdala Avenue, N19 5NF
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
    expect(file.places).toHaveLength(10);
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

  it("finds hospitals that take emergencies for 'A&E'", () => {
    const types = new Set(["Hospital", "Hospital with A&E", "A&E entrance"]);
    for (const q of ["A&E", "a&e", "A and E", "accident and emergency"]) {
      expect(typesForQuery(q, types)).toEqual(["Hospital with A&E", "A&E entrance"]);
    }
    expect(typesForQuery("hospitals", types)).toEqual(["Hospital"]);
  });
});

describe("blocks and estates", () => {
  const HOUSING = `#blueroute-places v1 2026-10-20 4
Smith House||Block of flats|housing|18|5155200|-11300|90 Holloway Road
Jones Court||Block of flats|housing|18|5155300|-11350|Holloway Road, N7
Bemerton Estate||Housing estate|housing|18|5154200|-11600|
Lower Holloway Road House||Block of flats|housing|11|5154600|-7500|1 Lower Holloway Roadside
`;
  let homes: SearchIndex;
  beforeAll(async () => {
    homes = new SearchIndex(
      parseRoads(readFileSync(join(dataDir, "roads.dat"), "utf8")),
      parsePostcodes(readFileSync(join(dataDir, "postcodes.dat"), "utf8")),
    );
    await homes.setPointsOfInterest(parsePlacesFile(HOUSING).places);
  });

  it("lists the named blocks on a road, by their address", () => {
    const names = homes.housingOnRoad("Holloway Road", { lat: 51.552, lng: -0.113 }).map((p) => p.name);
    expect(names).toEqual(["Jones Court", "Smith House"]);
  });

  it("finds blocks and estates near a point for the map, nearest first", () => {
    const names = homes.housingNear(51.5521, -0.1131, 300).map((p) => p.name);
    expect(names[0]).toBe("Smith House");
    expect(names).toContain("Jones Court");
    expect(names).not.toContain("Lower Holloway Road House");
  });

  it("gives every named block and estate in London for the map labels", () => {
    const all = homes.allHousing();
    expect(all.map((p) => p.name)).toEqual(expect.arrayContaining(["Smith House", "Jones Court", "Bemerton Estate"]));
    expect(all.every((p) => p.group === "housing")).toBe(true);
  });
});

describe("a name with the kind of place after it", () => {
  it("finds the station called Angel for Angel tube station", () => {
    for (const q of ["Angel tube station", "angel station", "Angel underground", "angel tube"]) {
      expect(top(q), q).toMatchObject({ label: "Angel", placeType: "Station" });
    }
  });

  it("finds The Whittington Hospital as Whittington Hospital", () => {
    expect(top("Whittington Hospital")).toMatchObject({ label: "The Whittington Hospital" });
  });

  it("still lists a kind on its own", () => {
    expect(index.search("hospitals", ISLINGTON).inArea.map((r) => r.label)).toContain("The Whittington Hospital");
  });
});
