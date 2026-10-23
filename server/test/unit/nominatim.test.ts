import { describe, expect, it } from "vitest";

import { BoroughLookup } from "../../src/boroughArea.js";
import {
  cachedNearestDoor,
  classify,
  NominatimClient,
  normaliseStreet,
  parseQuery,
  type NominatimResult,
} from "../../src/nominatim.js";

const boroughs = BoroughLookup.fromFile();

// Results in Nominatim's jsonv2 shape (addressdetails=1).
const house = (over: Partial<NominatimResult> = {}): NominatimResult => ({
  place_id: 1,
  osm_type: "way",
  osm_id: 123456,
  lat: "51.5441",
  lon: "-0.1171",
  // A mapped building with only an address: Nominatim calls it place/house.
  category: "place",
  type: "house",
  importance: 0.3,
  geojson: { type: "Polygon" },
  address: { house_number: "53", road: "Caledonian Road", postcode: "N7 9RN" },
  ...over,
});
const street: NominatimResult = {
  place_id: 2,
  osm_type: "way",
  osm_id: 4321,
  lat: "51.5470",
  lon: "-0.1180",
  category: "highway",
  type: "primary",
  name: "Caledonian Road",
  address: { road: "Caledonian Road" },
};
// A number worked out along an addr:interpolation line: the same category, but only a point on a way.
const interpolation = house({ osm_id: 999, geojson: { type: "Point" } });
const doorNode = house({ osm_type: "node", osm_id: 5, geojson: { type: "Point" } });

function client(results: unknown, status = 200) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(results), { status });
  }) as unknown as typeof fetch;
  return { nominatim: new NominatimClient("http://nominatim:8080", boroughs, impl), calls };
}

describe("Nominatim queries", () => {
  it("strips a flat or unit from the front, and keeps it for the label", () => {
    expect(parseQuery("Flat 3, 53 Caledonian Road")).toEqual({
      unit: "Flat 3",
      q: "53 Caledonian Road",
      number: "53",
      street: "Caledonian Road",
    });
    expect(parseQuery("Unit 2 53a Caledonian Rd, N7 9RN")).toMatchObject({
      unit: "Unit 2",
      number: "53a",
      street: "Caledonian Rd",
    });
    expect(parseQuery("Caledonian Road")).toEqual({ unit: undefined, q: "Caledonian Road" });
    // A postcode or district at the end isn't sent: a wrong one and Nominatim finds nothing.
    expect(parseQuery("53 Caledonian Road, N7 8LA").q).toBe("53 Caledonian Road");
    expect(parseQuery("53 Caledonian Road, N7").q).toBe("53 Caledonian Road");
    expect(parseQuery("n7 8la").q).toBe("N7 8LA");
  });

  it("compares street names through common abbreviations", () => {
    expect(normaliseStreet("Caledonian Rd.")).toBe("caledonian road");
    expect(normaliseStreet("Mildmay Gdns")).toBe(normaliseStreet("Mildmay Gardens"));
  });

  it("keeps searches to London, without a flat Nominatim wouldn't know", async () => {
    const { nominatim, calls } = client([]);
    await nominatim.search("Flat 3, 53 Caledonian Road");
    const url = new URL(calls[0]!);
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("q")).toBe("53 Caledonian Road");
    expect(url.searchParams.get("bounded")).toBe("1");
    expect(url.searchParams.get("viewbox")).toBe("-0.52,51.28,0.34,51.70");
    expect(url.searchParams.get("countrycodes")).toBe("gb");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("polygon_geojson")).toBe("1");
  });
});

describe("Nominatim precision", () => {
  const asked = parseQuery("53 Caledonian Road");

  it("is the door only for a mapped house with the number and street asked for", () => {
    expect(classify(house(), asked)).toEqual({ precision: "door", label: "53 Caledonian Road" });
    expect(classify(house(), parseQuery("Flat 3, 53 Caledonian Rd"))).toEqual({
      precision: "door",
      label: "Flat 3, 53 Caledonian Road",
    });
    // Another number, or another street: not what was asked for.
    expect(classify(house({ address: { house_number: "55", road: "Caledonian Road" } }), asked)).toBeNull();
    expect(classify(house({ address: { house_number: "53", road: "Holloway Road" } }), asked)).toBeNull();
  });

  it("calls a mapped building or node with the address the door, whatever Nominatim's category", () => {
    expect(classify(house(), asked)?.precision).toBe("door");
    expect(classify(doorNode, asked)?.precision).toBe("door");
    expect(classify(house({ category: "building", type: "yes" }), asked)?.precision).toBe("door");
  });

  it("calls an interpolated number a point on the road", () => {
    expect(classify(interpolation, asked)?.precision).toBe("road");
    expect(classify(interpolation, asked)?.label).toMatch(/estimated/);
  });

  it("calls a street found for a numbered address the road, labelled as the street alone", () => {
    expect(classify(street, parseQuery("54 Caledonian Road"))).toEqual({ precision: "road", label: "Caledonian Road" });
    expect(classify(street, parseQuery("Caledonian Road"))).toEqual({ precision: "road", label: "Caledonian Road" });
  });

  it("names a place by its own name, and drops one without a name", () => {
    const shop: NominatimResult = { ...street, category: "shop", type: "convenience", name: "Cally Food Centre" };
    expect(classify(shop, parseQuery("Cally Food"))).toEqual({
      precision: "place",
      label: "Cally Food Centre, Caledonian Road",
    });
    // A nameless building on the road was just "Caledonian Road" again, once per building.
    const building: NominatimResult = { ...street, category: "building", type: "yes", name: "" };
    expect(classify(building, parseQuery("Caledonian Road"))).toBeNull();
  });

  it("knows postcodes", () => {
    const pc: NominatimResult = {
      ...street,
      osm_type: undefined,
      osm_id: undefined,
      category: "place",
      type: "postcode",
      address: { postcode: "N7 8LA" },
    };
    expect(classify(pc, parseQuery("N7 8LA"))).toEqual({ precision: "postcode", label: "N7 8LA" });
  });
});

describe("NominatimClient", () => {
  it("returns OSM ids, precisions and boroughs, and drops places outside London", async () => {
    const outside = house({ osm_id: 7, lat: "51.6565", lon: "-0.3903" }); // Watford
    const { nominatim } = client([house(), street, outside]);
    const out = await nominatim.search("53 Caledonian Road");
    expect(out.map((a) => [a.id, a.precision, a.borough])).toEqual([
      ["osm:W123456", "door", "Islington"],
      ["osm:W4321", "road", "Islington"],
    ]);
    expect(out[0]).toMatchObject({ source: "osm", postcode: "N7 9RN", lat: 51.5441, lng: -0.1171 });
  });

  it("fails as unavailable when Nominatim is down or erroring", async () => {
    await expect(client([], 500).nominatim.search("x")).rejects.toMatchObject({ status: 503 });
    const down = new NominatimClient("http://127.0.0.1:1", boroughs);
    await expect(down.search("x")).rejects.toMatchObject({ status: 503 });
    expect(await down.ready(500)).toBe(false);
  });
});

describe("nearest house number (Pursuit)", () => {
  const client = (answer: unknown, ok = true) =>
    new NominatimClient("http://nominatim.test", boroughs, (async (url: string) => {
      expect(String(url)).toContain("/reverse?");
      return new Response(JSON.stringify(answer), { status: ok ? 200 : 500 });
    }) as unknown as typeof fetch);

  it("names the door by the car", async () => {
    const c = client(house({ lat: "51.5441", lon: "-0.1171", address: { house_number: "123", road: "Maida Vale" } }));
    expect(await c.nearestDoor(51.5442, -0.1172)).toBe("123 Maida Vale");
  });

  it("says nothing rather than guess: no number, too far, or no answer", async () => {
    expect(await client(street).nearestDoor(51.547, -0.118)).toBeNull();
    // 0.001° of latitude is about 110 m.
    expect(await client(house()).nearestDoor(51.5451, -0.1171)).toBeNull();
    expect(await client({}, false).nearestDoor(51.5441, -0.1171)).toBeNull();
  });

  it("asks once per ~10 m square a minute", async () => {
    let asked = 0;
    let now = 0;
    const find = cachedNearestDoor(
      async () => {
        asked++;
        return "1 Test Road";
      },
      () => now,
    );
    await find(51.54412, -0.11712);
    await find(51.54414, -0.11714); // same square
    expect(asked).toBe(1);
    now = 61_000;
    await find(51.54412, -0.11712);
    expect(asked).toBe(2);
  });
});
