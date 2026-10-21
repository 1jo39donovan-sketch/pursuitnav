import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { AddressSearch } from "../../src/addressSearch.js";
import { buildApp } from "../../src/app.js";
import { BoroughLookup } from "../../src/boroughArea.js";
import { NominatimClient } from "../../src/nominatim.js";
import { OsNamesClient } from "../../src/osNames.js";
import type { ServerConfig } from "../../src/config.js";
import type { Router } from "../../src/valhalla.js";

const config = (valhallaUrl: string) =>
  ({ bounds: [-0.8, 51.2, 0.6, 51.8], valhallaUrl, placesFile: "/nonexistent/places.txt.gz" }) as ServerConfig;

describe("GET /health", () => {
  it("is ok while the map data is still building", async () => {
    const res = await buildApp(config("http://127.0.0.1:1"), {} as Router).inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({
      ok: true,
      routing: false,
      places: false,
      addresses: { osNames: false, nominatim: false, osPlaces: false },
      learning: false,
    });
  });

  it("reports the address providers, and whether Nominatim answers", async () => {
    const boroughs = new BoroughLookup({ features: [] });
    const nominatim = createServer((req, res) => {
      res.statusCode = req.url === "/status" ? 200 : 404;
      res.end("OK");
    }).listen(0);
    try {
      const { port } = nominatim.address() as AddressInfo;
      const search = new AddressSearch([
        { source: "os-names", client: new OsNamesClient("KEY", boroughs), cacheable: true },
        { source: "osm", client: new NominatimClient(`http://127.0.0.1:${port}`, boroughs), cacheable: true },
      ]);
      const res = await buildApp(config("http://127.0.0.1:1"), {} as Router, search).inject({ method: "GET", url: "/health" });
      expect(res.json().addresses).toEqual({ osNames: true, nominatim: true, osPlaces: false });
      const down = new AddressSearch([
        { source: "osm", client: new NominatimClient("http://127.0.0.1:1", boroughs), cacheable: true },
      ]);
      const res2 = await buildApp(config("http://127.0.0.1:1"), {} as Router, down).inject({ method: "GET", url: "/health" });
      expect(res2.json().addresses).toEqual({ osNames: false, nominatim: false, osPlaces: false });
    } finally {
      nominatim.close();
    }
  });

  it("says which code version it runs", async () => {
    const res = await buildApp({ ...config("http://127.0.0.1:1"), version: "c9d9b94" }, {} as Router).inject({
      method: "GET",
      url: "/health",
    });
    expect(res.json().version).toBe("c9d9b94");
  });

  it("says when routing is ready", async () => {
    const valhalla = createServer((_req, res) => res.end("{}")).listen(0);
    try {
      const { port } = valhalla.address() as AddressInfo;
      const res = await buildApp(config(`http://127.0.0.1:${port}`), {} as Router).inject({ method: "GET", url: "/health" });
      expect(res.json().routing).toBe(true);
    } finally {
      valhalla.close();
    }
  });
});
