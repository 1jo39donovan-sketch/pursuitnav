import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import { entrancesNear, parseEntrances } from "../../src/entrances.js";

const FILE = [
  "#blueroute-entrances v1 2026-10-25 3",
  "5154630|-11710|main|A|||Caledonian Road|1-24",
  "5154640|-11690|staircase|B||54||25-48",
  "5156000|-11700|yes|||||",
].join("\n");

describe("entrances", () => {
  it("finds the ways into a building by a door, nearest first, and not far ones", () => {
    const near = entrancesNear(parseEntrances(FILE), { lat: 51.54632, lng: -0.11705 });
    expect(near.map((e) => e.ref)).toEqual(["A", "B"]);
    expect(near[0]).toMatchObject({ kind: "main", flats: "1-24", street: "Caledonian Road" });
    expect(near[1]).toMatchObject({ housenumber: "54", flats: "25-48" });
  });

  it("answers from the weekly file, and says when it isn't built", async () => {
    const dir = mkdtempSync(join(tmpdir(), "entrances-"));
    const path = join(dir, "entrances.txt.gz");
    writeFileSync(path, gzipSync(FILE));
    const config = { bounds: [-0.8, 51.2, 0.6, 51.8], entrancesFile: path } as unknown as ServerConfig;
    const router = {} as never;
    const app = buildApp(config, router);
    const res = await app.inject({ method: "POST", url: "/v1/entrances", payload: { lat: 51.54632, lng: -0.11705 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().entrances).toHaveLength(2);
    const none = buildApp({ ...config, entrancesFile: join(dir, "missing.gz") } as ServerConfig, router);
    expect((await none.inject({ method: "POST", url: "/v1/entrances", payload: { lat: 51.5, lng: -0.1 } })).statusCode).toBe(503);
  });
});
