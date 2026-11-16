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
