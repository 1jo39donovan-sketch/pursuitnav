import { describe, expect, it, vi } from "vitest";

import { nightify, restyle, scaleWidth } from "../mapLooks";

// Hoisted above the imports by vitest.
vi.mock("../../config", () => ({ API_URL: "https://api.example" }));

const style = {
  version: 8,
  sources: { openmaptiles: { type: "vector", url: "x" } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#111" } },
    {
      id: "road_primary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      paint: { "line-color": "#333", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 8] },
    },
    {
      id: "road_minor_casing",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      paint: { "line-width": { stops: [[12, 1], [18, 6]] } },
    },
    { id: "poi", type: "symbol", source: "openmaptiles", "source-layer": "poi", layout: {} },
    { id: "road_label", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", layout: {} },
  ],
} as never;

type Painted = { paint: Record<string, unknown> };

describe("map looks", () => {
  it("leaves the standard style as it is", () => {
    expect(restyle(style, "standard", "night")).toBe(style);
  });

  it("widens roads and strengthens text for Clear, keeping zoom curves valid", () => {
    const s = restyle(style, "clear", "night");
    const primary = s.layers[1] as unknown as Painted;
    expect(primary.paint["line-width"]).toEqual(["interpolate", ["linear"], ["zoom"], 10, 1.5, 16, 12]);
    expect(primary.paint["line-color"]).toBe("#f1f4fa");
    expect((s.layers[2] as unknown as Painted).paint["line-color"]).toBe("#000000");
    expect((s.layers[4] as unknown as Painted).paint["text-color"]).toBe("#ffffff");
    expect(scaleWidth({ stops: [[12, 1], [18, 6]] }, 2)).toEqual({ stops: [[12, 2], [18, 12]] });
    expect(scaleWidth(["get", "w"], 2)).toEqual(["get", "w"]);
  });

  it("drops shop and business icons for Plain, keeping road names", () => {
    const ids = restyle(style, "plain", "day").layers.map((l) => l.id);
    expect(ids).not.toContain("poi");
    expect(ids).toContain("road_label");
  });

  it("puts the OS road map from our server over the top, free zooms only, with OS's credit", () => {
    const s = restyle(style, "os", "night");
    const src = s.sources["os-road"] as { tiles: string[]; maxzoom: number; attribution: string };
    expect(src.tiles[0]).toBe("https://api.example/v1/os-maps/Road/{z}/{x}/{y}.png");
    expect(src.maxzoom).toBe(16);
    expect(src.attribution).toMatch(/Crown copyright/);
    expect(s.layers.at(-1)?.id).toBe("os-road");
    expect(s.layers).toHaveLength(6);
  });

  it("makes night from the detailed day map, keeping every layer, recoloured dark", () => {
    const n = nightify(style);
    expect(n.layers.map((l) => l.id)).toEqual((style as { layers: { id: string }[] }).layers.map((l) => l.id));
    expect((n.layers[0] as unknown as Painted).paint["background-color"]).toBe("#0f1520");
    expect((n.layers[2] as unknown as Painted).paint["line-color"]).toBe("#06090f");
    expect((n.layers[4] as unknown as Painted).paint["text-color"]).toBe("#c4ccda");
  });
});
