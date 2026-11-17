import { describe, expect, it } from "vitest";

import { TRANSPORT_PREFIX, withTransport } from "../mapTransport";

const style = {
  version: 8,
  sources: { openmaptiles: { type: "vector", url: "x" } },
  layers: [
    { id: "background", type: "background", paint: {} },
    { id: "road_primary", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: {} },
    { id: "poi_transit", type: "symbol", source: "openmaptiles", "source-layer": "poi", layout: { "text-font": ["Noto Sans Regular"] } },
    { id: "poi_r1", type: "symbol", source: "openmaptiles", "source-layer": "poi", layout: {} },
    { id: "road_label", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", layout: {} },
  ],
} as never;

type L = { id: string; source?: string; layout?: Record<string, unknown> };
const ids = (s: { layers: unknown[] }) => (s.layers as L[]).map((l) => l.id);

describe("transport on the map", () => {
  it("draws lines under the labels and stations on top", () => {
    const s = withTransport(style, "night");
    const list = ids(s);
    const lines = list.indexOf(`${TRANSPORT_PREFIX}lines`);
    expect(lines).toBeGreaterThan(list.indexOf("road_primary"));
    expect(lines).toBeLessThan(list.indexOf("poi_transit"));
    expect(list[list.length - 1]).toBe(`${TRANSPORT_PREFIX}labels`);
    expect((s.layers as L[]).filter((l) => l.id.startsWith(TRANSPORT_PREFIX)).every((l) => l.source === "openmaptiles")).toBe(true);
  });

  it("hides the style's own station icons but keeps other places", () => {
    const s = withTransport(style, "day");
    const byId = new Map((s.layers as L[]).map((l) => [l.id, l]));
    expect(byId.get("poi_transit")?.layout?.visibility).toBe("none");
    expect(byId.get("poi_r1")?.layout?.visibility).toBeUndefined();
  });

  it("labels in the style's own font, bold", () => {
    const s = withTransport(style, "day");
    const label = (s.layers as L[]).find((l) => l.id === `${TRANSPORT_PREFIX}labels`);
    expect(label?.layout?.["text-font"]).toEqual(["Noto Sans Bold"]);
  });

  it("is safe to apply twice and leaves a style with no vector tiles alone", () => {
    const once = withTransport(style, "night");
    expect(ids(withTransport(once, "night"))).toEqual(ids(once));
    const raster = { version: 8, sources: { r: { type: "raster", tiles: [] } }, layers: [] } as never;
    expect(withTransport(raster, "night")).toBe(raster);
  });
});

describe("lines in their own colours", () => {
  const FILE = `#blueroute-lines v1 2026-11-17 3
Victoria line|#0098d4|subway|1|-12000,5155000 -11000,5156000
DLR|#00a4a7|light_rail|0|-2000,5151000 -1000,5151500
Broken|blue|subway|0|-1,1 -2,2
`;

  it("reads the weekly file as GeoJSON, skipping bad rows", async () => {
    const { parseLines } = await import("../transportLinesData");
    const lines = parseLines(FILE)!;
    expect(lines.version).toBe("2026-11-17");
    expect(lines.geojson.features).toHaveLength(2);
    expect(lines.geojson.features[0]).toMatchObject({
      geometry: { coordinates: [[-0.12, 51.55], [-0.11, 51.56]] },
      properties: { name: "Victoria line", colour: "#0098d4", tunnel: true },
    });
    expect(parseLines("#blueroute-places v1 x 0\n")).toBeNull();
  });

  it("draws them over the tiles' lines and under the labels", async () => {
    const { parseLines } = await import("../transportLinesData");
    const { LINES_SOURCE } = await import("../mapTransport");
    const s = withTransport(style, "night", parseLines(FILE)!.geojson);
    const list = ids(s);
    expect(s.sources[LINES_SOURCE]).toBeDefined();
    const coloured = list.indexOf(`${TRANSPORT_PREFIX}tfl-lines`);
    expect(coloured).toBeGreaterThan(list.indexOf(`${TRANSPORT_PREFIX}lines`));
    expect(coloured).toBeLessThan(list.indexOf("road_label"));
    expect(ids(withTransport(style, "night"))).not.toContain(`${TRANSPORT_PREFIX}tfl-lines`);
  });
});
