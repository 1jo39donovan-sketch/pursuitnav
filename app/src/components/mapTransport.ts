// Transport drawn clearly on every map look: Underground, Overground, DLR,
// tram and rail lines, their stations, and bus stations (bus stops close in).
// Officers use stations as landmarks and meeting points, and ask "which
// station is that?" on the way to a job.
//
// Drawn from the same vector tiles as the rest of the map (OpenMapTiles
// `transportation` and `poi` layers), so it works offline too. The symbols
// are plain circles of our own, not the TfL roundel (a trademark): a ring
// coloured by the kind of line, the name beside it.
import type { StyleSpecification } from "@maplibre/maplibre-react-native";

import type { MapTheme } from "../session/SessionProvider";

type Layer = StyleSpecification["layers"][number];

export const TRANSPORT_PREFIX = "br-transport-";

// Not TfL's own palette: close enough to read at a glance, our own colours.
export const LINE_COLOURS = {
  subway: "#d2232a",
  light_rail: "#00a3a6",
  tram: "#5ba829",
  rail: "#5a6275",
  railNight: "#9aa3b5",
  bus: "#1f6fd1",
};

const sourceLayer = (l: Layer) => (l as { "source-layer"?: string })["source-layer"];
const isOurs = (l: Layer) => l.id.startsWith(TRANSPORT_PREFIX);

/** The style's vector source with OpenMapTiles layers, or null. */
function tilesSource(style: StyleSpecification): string | null {
  const used = style.layers.find((l) => sourceLayer(l) === "transportation" || sourceLayer(l) === "poi");
  const src = (used as { source?: string } | undefined)?.source;
  if (src && style.sources[src]) return src;
  return Object.entries(style.sources).find(([, s]) => s.type === "vector")?.[0] ?? null;
}

/** The font the style already labels with, so the glyphs are there (offline too). */
function labelFont(style: StyleSpecification): string[] {
  for (const l of style.layers) {
    const f = (l.layout as { "text-font"?: unknown } | undefined)?.["text-font"];
    if (Array.isArray(f) && f.every((x) => typeof x === "string")) {
      const bold = f.map((x: string) => x.replace(/Regular|Italic/, "Bold"));
      return f.some((x: string) => /Bold/.test(x)) ? f : bold;
    }
  }
  return ["Noto Sans Bold"];
}

// The style's own station and bus icons, hidden where ours are drawn.
const THEIR_STATIONS = /transit|railway|station|bus/;

/** The style with transport drawn on top, or as it was if it has no vector tiles. */
export function withTransport(style: StyleSpecification, theme: MapTheme): StyleSpecification {
  const source = tilesSource(style);
  if (!source) return style;
  const night = theme === "night";
  const rail = night ? LINE_COLOURS.railNight : LINE_COLOURS.rail;
  const halo = night ? "#0b1019" : "#ffffff";
  const text = night ? "#f1f4fa" : "#111111";
  const font = labelFont(style);

  const lineColour = [
    "match",
    ["get", "subclass"],
    "subway",
    LINE_COLOURS.subway,
    ["light_rail", "monorail"],
    LINE_COLOURS.light_rail,
    "tram",
    LINE_COLOURS.tram,
    rail,
  ];
  const kindColour = [
    "match",
    ["get", "subclass"],
    "subway",
    LINE_COLOURS.subway,
    ["light_rail", "monorail"],
    LINE_COLOURS.light_rail,
    "tram_stop",
    LINE_COLOURS.tram,
    rail,
  ];

  const railLines = ["all", ["match", ["get", "class"], ["rail", "transit"], true, false], ["!=", ["get", "service"], "yard"]];
  const stations = ["all", ["==", ["get", "class"], "railway"], ["match", ["get", "subclass"], ["station", "halt", "subway", "light_rail", "tram_stop"], true, false]];
  const busStations = ["all", ["==", ["get", "class"], "bus"], ["==", ["get", "subclass"], "bus_station"]];
  const busStops = ["all", ["==", ["get", "class"], "bus"], ["==", ["get", "subclass"], "bus_stop"]];

  const lines: Layer[] = [
    {
      id: `${TRANSPORT_PREFIX}lines-casing`,
      type: "line",
      source,
      "source-layer": "transportation",
      minzoom: 11,
      filter: railLines as never,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": halo,
        "line-opacity": ["case", ["==", ["get", "brunnel"], "tunnel"], 0.35, 0.8] as never,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2.4, 14, 4.5, 17, 8] as never,
      },
    },
    {
      id: `${TRANSPORT_PREFIX}lines`,
      type: "line",
      source,
      "source-layer": "transportation",
      minzoom: 11,
      filter: railLines as never,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": lineColour as never,
        // Lines underground drawn fainter: the roads above them matter more.
        "line-opacity": ["case", ["==", ["get", "brunnel"], "tunnel"], 0.45, 0.95] as never,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.2, 14, 2.4, 17, 4.5] as never,
      },
    },
  ];

  const points: Layer[] = [
    {
      id: `${TRANSPORT_PREFIX}bus-stops`,
      type: "circle",
      source,
      "source-layer": "poi",
      minzoom: 16,
      filter: busStops as never,
      paint: {
        "circle-radius": 3.5,
        "circle-color": LINE_COLOURS.bus,
        "circle-stroke-color": halo,
        "circle-stroke-width": 1.2,
      },
    },
    {
      id: `${TRANSPORT_PREFIX}stations`,
      type: "circle",
      source,
      "source-layer": "poi",
      minzoom: 11,
      filter: stations as never,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3.5, 14, 6, 17, 9] as never,
        "circle-color": "#ffffff",
        "circle-stroke-color": kindColour as never,
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 11, 1.8, 14, 2.8, 17, 4] as never,
      },
    },
    {
      id: `${TRANSPORT_PREFIX}bus-stations`,
      type: "circle",
      source,
      "source-layer": "poi",
      minzoom: 12,
      filter: busStations as never,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 5, 15, 8, 17, 10] as never,
        "circle-color": LINE_COLOURS.bus,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    },
    {
      id: `${TRANSPORT_PREFIX}bus-stations-letter`,
      type: "symbol",
      source,
      "source-layer": "poi",
      minzoom: 14,
      filter: busStations as never,
      layout: {
        "text-field": "B",
        "text-font": font,
        "text-size": ["interpolate", ["linear"], ["zoom"], 14, 9, 17, 12] as never,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": "#ffffff" },
    },
    {
      id: `${TRANSPORT_PREFIX}labels`,
      type: "symbol",
      source,
      "source-layer": "poi",
      minzoom: 12,
      filter: ["any", stations, busStations] as never,
      layout: {
        "text-field": ["get", "name"] as never,
        "text-font": font,
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 11, 16, 14] as never,
        "text-anchor": "left",
        "text-offset": [0.9, 0],
        "text-max-width": 9,
      },
      paint: {
        "text-color": text,
        "text-halo-color": halo,
        "text-halo-width": 2,
      },
    },
  ];

  const kept = style.layers
    .filter((l) => !isOurs(l))
    .map((l) =>
      l.type === "symbol" && sourceLayer(l) === "poi" && THEIR_STATIONS.test(l.id)
        ? ({ ...l, layout: { ...l.layout, visibility: "none" } } as Layer)
        : l,
    );
  // Lines under the labels (street names stay readable); stations on top of everything.
  const firstLabel = kept.findIndex((l) => l.type === "symbol");
  const at = firstLabel === -1 ? kept.length : firstLabel;
  return { ...style, layers: [...kept.slice(0, at), ...lines, ...kept.slice(at), ...points] };
}
