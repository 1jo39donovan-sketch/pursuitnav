// What app versions already on officers' phones read from the server. Phones
// don't all update at once, so a server change must keep these working: a
// change that breaks this test breaks apps in the field. (On 21 Oct 2026 the
// free address results came without a uprn, which those apps key their
// result rows by, and their lists showed rows from earlier searches.)
// Add a field here when the app starts relying on it; never remove one while
// an app that reads it may still be in use.
import { describe, expect, it } from "vitest";

import { AddressSearch } from "../../src/addressSearch.js";
import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import type { Address } from "../../src/places.js";
import type { Route, Router } from "../../src/valhalla.js";

const config = {
  bounds: [-0.8, 51.2, 0.6, 51.8],
  placesFile: "/nonexistent",
  minSavingSeconds: 30,
  minSavingFraction: 0.05,
  restrictionCheckBudget: 10,
} as unknown as ServerConfig;

const route: Route = {
  durationS: 300,
  distanceM: 2000,
  shape: [
    [-0.1037, 51.5463],
    [-0.1238, 51.5308],
  ],
  maneuvers: [
    {
      type: 1,
      instruction: "Drive west.",
      streetNames: ["Holloway Road"],
      lengthM: 2000,
      timeS: 300,
      beginShapeIndex: 0,
      endShapeIndex: 1,
    },
  ],
};
const router: Router = { route: async () => route, traceEdges: async () => [] };

const address = (over: Partial<Address>): Address => ({
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

describe("what apps in the field read", () => {
  it("/v1/addresses: a unique uprn per row, and the fields every app shows", async () => {
    const search = new AddressSearch([
      {
        source: "osm",
        cacheable: true,
        client: {
          search: async () => [
            address({}),
            address({ id: "osm:W2", precision: "road", label: "Caledonian Road", lat: 51.55 }),
          ],
        },
      },
      {
        source: "os-names",
        cacheable: true,
        client: {
          search: async () => [
            address({
              id: "os-names:p",
              source: "os-names",
              precision: "postcode",
              label: "N7 8LA",
              postcode: "N7 8LA",
            }),
          ],
        },
      },
    ]);
    const res = await buildApp(config, router, search).inject({
      method: "POST",
      url: "/v1/addresses",
      payload: { query: "53 Caledonian Road" },
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json().addresses as Record<string, unknown>[];
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(typeof r.uprn).toBe("string");
      expect(typeof r.label).toBe("string");
      expect(typeof r.postcode).toBe("string");
      expect(typeof r.borough).toBe("string");
      expect(typeof r.lat).toBe("number");
      expect(typeof r.lng).toBe("number");
      expect(typeof r.match).toBe("number");
    }
    expect(new Set(rows.map((r) => r.uprn)).size).toBe(rows.length);
  });

  it("/v1/addresses: 503 addresses-not-configured when there's no address search", async () => {
    const res = await buildApp(config, router).inject({
      method: "POST",
      url: "/v1/addresses",
      payload: { query: "53 Caledonian Road" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("addresses-not-configured");
  });

  it("/v1/routes: the standard route with its turns, and the police route or why not", async () => {
    const res = await buildApp(config, router).inject({
      method: "POST",
      url: "/v1/routes",
      payload: { from: { lat: 51.5463, lng: -0.1037 }, to: { lat: 51.5308, lng: -0.1238 } },
    });
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    expect(plan.standard).toMatchObject({
      durationS: expect.any(Number),
      distanceM: expect.any(Number),
      shape: expect.any(Array),
      maneuvers: expect.any(Array),
    });
    expect(plan.standard.maneuvers[0]).toMatchObject({
      type: expect.any(Number),
      instruction: expect.any(String),
      streetNames: expect.any(Array),
      lengthM: expect.any(Number),
      timeS: expect.any(Number),
      beginShapeIndex: expect.any(Number),
      endShapeIndex: expect.any(Number),
    });
    expect(plan.police === null || typeof plan.police.savingS === "number").toBe(true);
    if (plan.police === null) expect(typeof plan.noPoliceReason).toBe("string");
  });

  it("/health: ok, routing and places", async () => {
    const res = await buildApp({ ...config, valhallaUrl: "http://127.0.0.1:1" }, router).inject({
      method: "GET",
      url: "/health",
    });
    expect(res.json()).toMatchObject({ ok: true, routing: expect.any(Boolean), places: expect.any(Boolean) });
  });
});
