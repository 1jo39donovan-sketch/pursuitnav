import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import { labelFor, OsPlacesClient, titleCase, type PlacesClient } from "../../src/places.js";
import type { Router } from "../../src/valhalla.js";

// Synthetic records in the documented OS Places DPA shape (output_srs=EPSG:4326).
const dpa = (over: Record<string, unknown>) => ({
  DPA: {
    UPRN: "5300000001",
    BUILDING_NUMBER: "54",
    THOROUGHFARE_NAME: "CALEDONIAN ROAD",
    POST_TOWN: "LONDON",
    POSTCODE: "N7 8LA",
    LOCAL_CUSTODIAN_CODE: 5570,
    LAT: 51.5441,
    LNG: -0.1171,
    MATCH: 1,
    ...over,
  },
});

function fakeFetch(body: unknown, status = 200) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("labels", () => {
  it("builds 'Flat 3, 54 Caledonian Road' from the address parts", () => {
    expect(labelFor(dpa({ SUB_BUILDING_NAME: "FLAT 3" }).DPA as never)).toBe("Flat 3, 54 Caledonian Road");
  });

  it("includes named buildings", () => {
    expect(
      labelFor(dpa({ SUB_BUILDING_NAME: "FLAT 12", BUILDING_NAME: "SMITH HOUSE", BUILDING_NUMBER: undefined, THOROUGHFARE_NAME: "HOLLOWAY ROAD" }).DPA as never),
    ).toBe("Flat 12, Smith House, Holloway Road");
  });

  it("puts a business name first", () => {
    expect(labelFor(dpa({ ORGANISATION_NAME: "TESCO STORES LTD", BUILDING_NUMBER: "380", THOROUGHFARE_NAME: "HOLLOWAY ROAD" }).DPA as never)).toBe(
      "Tesco Stores Ltd, 380 Holloway Road",
    );
  });

  it("title-cases without breaking flat letters", () => {
    expect(titleCase("FLAT 3A, ST JOHN'S ROAD")).toBe("Flat 3a, St John's Road");
  });
});

describe("OsPlacesClient", () => {
  it("uses the postcode endpoint for a full postcode, and find for anything else", async () => {
    const f = fakeFetch({ results: [] });
    const client = new OsPlacesClient("KEY", f.impl);
    await client.search("n7 8la");
    await client.search("54 Caledonian Road");
    expect(f.calls[0]).toContain("/postcode?");
    expect(f.calls[0]).toContain("postcode=N78LA");
    expect(f.calls[1]).toContain("/find?");
    expect(f.calls[1]).toContain("output_srs=EPSG%3A4326");
  });

  it("keeps only London addresses and names the borough", async () => {
    const f = fakeFetch({
      results: [dpa({}), dpa({ UPRN: "2", LOCAL_CUSTODIAN_CODE: 1234, POSTCODE: "AB1 2CD" }), dpa({ UPRN: "3", LOCAL_CUSTODIAN_CODE: 5420 })],
    });
    const out = await new OsPlacesClient("KEY", f.impl).search("54 Caledonian Road");
    expect(out.map((a) => [a.uprn, a.borough])).toEqual([
      ["5300000001", "Islington"],
      ["3", "Haringey"],
    ]);
    expect(out[0]).toMatchObject({ label: "54 Caledonian Road", postcode: "N7 8LA", lat: 51.5441, lng: -0.1171 });
  });

  it("treats a query OS can't parse as no matches", async () => {
    const out = await new OsPlacesClient("KEY", fakeFetch({ error: {} }, 400).impl).search("??");
    expect(out).toEqual([]);
  });
});

describe("POST /v1/addresses", () => {
  const config = { bounds: [-0.8, 51.2, 0.6, 51.8] } as ServerConfig;
  const router = {} as Router;

  it("says when address search isn't configured", async () => {
    const app = buildApp(config, router);
    const res = await app.inject({ method: "POST", url: "/v1/addresses", payload: { query: "54 Caledonian Road" } });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("addresses-not-configured");
  });

  it("returns addresses from the places client", async () => {
    const places: PlacesClient = {
      search: async () => [
        { uprn: "1", label: "54 Caledonian Road", postcode: "N7 8LA", borough: "Islington", lat: 51.5, lng: -0.1, match: 1 },
      ],
    };
    const app = buildApp(config, router, places);
    const res = await app.inject({ method: "POST", url: "/v1/addresses", payload: { query: "54 Caledonian Road" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().addresses[0].label).toBe("54 Caledonian Road");
  });
});
