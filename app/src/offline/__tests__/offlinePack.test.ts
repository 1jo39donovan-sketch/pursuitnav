import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { region, type RegionConfig } from "../../config";
import {
  isManifest,
  localStyle,
  readyText,
  safePath,
  sizeText,
  staleText,
  stillToFetch,
  unsuitable,
  type OfflineManifest,
} from "../offlinePack";

const manifest = (over: Partial<OfflineManifest> = {}): OfflineManifest => ({
  format: 1,
  built: "2026-10-25T01:00:00Z",
  version: "20261025T010000Z",
  base: "/v1/offline-map/20261025T010000Z/",
  bounds: region.maxBounds as [number, number, number, number],
  minZoom: 0,
  maxZoom: 14,
  styles: { night: "styles/night.json", day: "styles/day.json" },
  bytes: 123_400_000,
  files: [
    { path: "map.pmtiles", bytes: 123_000_000, sha256: "a" },
    { path: "styles/night.json", bytes: 200_000, sha256: "b" },
    { path: "styles/day.json", bytes: 200_000, sha256: "c" },
  ],
  ...over,
});

describe("offline map pack", () => {
  it("takes its area and zooms from the region config", () => {
    expect(unsuitable(manifest(), region)).toBeNull();
    // Another region: the same pack doesn't cover it.
    const elsewhere: RegionConfig = {
      ...region,
      name: "Elsewhere",
      maxBounds: [10, 10, 11, 11],
    };
    expect(unsuitable(manifest(), elsewhere)).toMatch(/doesn't cover Elsewhere/);
    // A pack that starts too close in for the region's zooms.
    expect(unsuitable(manifest({ minZoom: region.offlineZooms[0] + 1 }), region)).toMatch(/detail/);
    expect(unsuitable(manifest({ maxZoom: 12 }), region)).toMatch(/detail/);
  });

  it("shows its size before downloading, and what's left after a break", () => {
    expect(sizeText(manifest().bytes)).toBe("123 MB");
    expect(sizeText(4_200_000)).toBe("4.2 MB");
    const left = stillToFetch(manifest(), (p) => (p === "map.pmtiles" ? 123_000_000 : null));
    expect(left.files.map((f) => f.path)).toEqual(["styles/night.json", "styles/day.json"]);
    expect(left.bytes).toBe(400_000);
  });

  it("asks for an update on Wi-Fi after 30 days", () => {
    const built = "2026-10-01T01:00:00Z";
    expect(staleText(built, Date.parse("2026-10-25T00:00:00Z"))).toBeNull();
    expect(staleText(built, Date.parse("2026-11-05T12:00:00Z"))).toBe("Offline map is 35 days old: update on Wi-Fi");
    expect(readyText(built, 123_000_000)).toBe("Map of 1 Oct 2026 · 123 MB");
  });

  it("points a style at the files on the phone", () => {
    const style = JSON.stringify({
      sources: { openmaptiles: { type: "vector", url: "pmtiles://blueroute-pack://map.pmtiles" } },
      glyphs: "blueroute-pack://fonts/{fontstack}/{range}.pbf",
      sprite: "blueroute-pack://sprites/night/default",
    });
    const local = JSON.parse(localStyle(style, "file:///data/offline-map/20261025T010000Z")) as {
      sources: { openmaptiles: { url: string } };
      glyphs: string;
      sprite: string;
    };
    expect(local.sources.openmaptiles.url).toBe("pmtiles://file:///data/offline-map/20261025T010000Z/map.pmtiles");
    expect(local.glyphs).toBe("file:///data/offline-map/20261025T010000Z/fonts/{fontstack}/{range}.pbf");
    expect(local.sprite).toBe("file:///data/offline-map/20261025T010000Z/sprites/night/default");
  });

  it("only accepts a well-formed manifest and file names inside the pack", () => {
    expect(isManifest(manifest())).toBe(true);
    expect(isManifest({ ...manifest(), version: "../x" })).toBe(false);
    expect(isManifest(null)).toBe(false);
    expect(safePath("fonts/NotoSansBold/0-255.pbf")).toBe(true);
    expect(safePath("sprites/night/default@2x.png")).toBe(true);
    expect(safePath("../secret")).toBe(false);
    expect(safePath("/etc/passwd")).toBe(false);
  });

  it("has no coordinates of its own: the area comes from config", () => {
    // Any lat/lng-looking number (two digits or fewer, a point, two or more
    // decimals) in the offline code would be an area written into the code.
    const dir = join(__dirname, "..");
    for (const name of readdirSync(dir).filter((f) => /\.tsx?$/.test(f))) {
      const code = readFileSync(join(dir, name), "utf8").replace(/\/\/.*$/gm, "");
      expect(code, name).not.toMatch(/-?\b\d{1,3}\.\d{2,}\b/);
    }
  });
});
