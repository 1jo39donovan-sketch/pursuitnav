import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import type { Router } from "../../src/valhalla.js";

const config = (valhallaUrl: string) =>
  ({ bounds: [-0.8, 51.2, 0.6, 51.8], valhallaUrl, placesFile: "/nonexistent/places.txt.gz" }) as ServerConfig;

describe("GET /health", () => {
  it("is ok while the map data is still building", async () => {
    const res = await buildApp(config("http://127.0.0.1:1"), {} as Router).inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({ ok: true, routing: false, places: false });
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
