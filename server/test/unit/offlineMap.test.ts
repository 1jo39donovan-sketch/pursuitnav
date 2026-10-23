import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import { parseRange } from "../../src/offlineMap.js";

function packDir() {
  const dir = mkdtempSync(join(tmpdir(), "offline-"));
  mkdirSync(join(dir, "styles"));
  writeFileSync(join(dir, "map.pmtiles"), Buffer.from("0123456789"));
  writeFileSync(join(dir, "styles/night.json"), "{}");
  writeFileSync(join(dir, "secret.txt"), "not listed");
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      format: 1,
      built: "2026-10-25T01:00:00Z",
      bounds: [-1, 50, 1, 52],
      minZoom: 0,
      maxZoom: 14,
      styles: { night: "styles/night.json" },
      bytes: 12,
      files: [
        { path: "map.pmtiles", bytes: 10, sha256: "a".repeat(64) },
        { path: "styles/night.json", bytes: 2, sha256: "b".repeat(64) },
      ],
    }),
  );
  return dir;
}

function app(dir: string | undefined) {
  const config = { bounds: [-1, 51, 1, 52], placesFile: "/nonexistent", offlineMapDir: dir } as unknown as ServerConfig;
  return buildApp(config, { route: async () => ({}) as never, traceEdges: async () => [] });
}

describe("offline map", () => {
  it("serves the manifest, then each file under its version, resumable, with long cache headers", async () => {
    const a = app(packDir());
    const m = await a.inject({ url: "/v1/offline-map" });
    expect(m.statusCode).toBe(200);
    expect(m.headers["cache-control"]).toBe("no-cache");
    expect(m.json()).toMatchObject({ version: "20261025T010000Z", base: "/v1/offline-map/20261025T010000Z/", bytes: 12 });

    const whole = await a.inject({ url: "/v1/offline-map/20261025T010000Z/map.pmtiles" });
    expect(whole.statusCode).toBe(200);
    expect(whole.body).toBe("0123456789");
    expect(whole.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(whole.headers["accept-ranges"]).toBe("bytes");

    // Carrying on where a download stopped.
    const rest = await a.inject({ url: "/v1/offline-map/20261025T010000Z/map.pmtiles", headers: { range: "bytes=6-" } });
    expect(rest.statusCode).toBe(206);
    expect(rest.body).toBe("6789");
    expect(rest.headers["content-range"]).toBe("bytes 6-9/10");

    const style = await a.inject({ url: "/v1/offline-map/20261025T010000Z/styles/night.json" });
    expect(style.headers["content-type"]).toMatch(/^application\/json/);
  });

  it("refuses files it doesn't list, and an old version's", async () => {
    const a = app(packDir());
    expect((await a.inject({ url: "/v1/offline-map/20261025T010000Z/secret.txt" })).statusCode).toBe(404);
    expect((await a.inject({ url: "/v1/offline-map/20261025T010000Z/../manifest.json" })).statusCode).toBe(404);
    const old = await a.inject({ url: "/v1/offline-map/20261018T010000Z/map.pmtiles" });
    expect(old.statusCode).toBe(404);
    expect(old.json().error).toBe("offline-map-replaced");
  });

  it("says when there's no offline map yet", async () => {
    expect((await app(undefined).inject({ url: "/v1/offline-map" })).statusCode).toBe(503);
  });

  it("reads byte ranges", () => {
    expect(parseRange("bytes=0-4", 10)).toEqual({ start: 0, end: 4 });
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("bytes=5-99", 10)).toEqual({ start: 5, end: 9 });
    expect(parseRange("bytes=10-", 10)).toBeNull();
    expect(parseRange("items=0-1", 10)).toBeNull();
  });

  it("builds the area from the same region setting as the server", () => {
    // scripts/lib.sh's default is src/config.ts's: the offline map covers what's routed.
    const lib = readFileSync(join(__dirname, "../../scripts/lib.sh"), "utf8");
    const config = readFileSync(join(__dirname, "../../src/config.ts"), "utf8");
    const shell = /DEFAULT_REGION_BOUNDS=(\S+)/.exec(lib)![1]!.split(",").map(Number);
    const ts = JSON.parse(/LONDON_BOUNDS: ServerConfig\["bounds"\] = (\[[^\]]+\])/.exec(config)![1]!);
    expect(shell).toEqual(ts);
  });
});
