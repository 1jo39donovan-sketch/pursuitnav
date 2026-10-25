// Map styles beyond the standard one, made by changing the standard style
// (online or the offline one on the phone) rather than loading other maps,
// so every look draws the same tiles and works with no signal:
// - Clear: high contrast for a moving car: wider, brighter roads and the
//   strongest text.
// - Plain: no shop and business icons or other clutter, just the streets.
// - OS: Ordnance Survey's road map over the top, through our server (the
//   key stays there; free OpenData zooms only). With no signal, or past its
//   last zoom, the standard map shows through underneath.
import { useEffect, useState } from "react";
import type { StyleSpecification } from "@maplibre/maplibre-react-native";

import { API_URL } from "../config";
import type { MapTheme } from "../session/SessionProvider";

export type MapLook = "standard" | "clear" | "plain" | "os";
export const MAP_LOOKS: MapLook[] = ["standard", "clear", "plain", "os"];
export const MAP_LOOK_NAMES: Record<MapLook, string> = {
  standard: "Standard",
  clear: "Clear",
  plain: "Plain",
  os: "OS map",
};

/** The OS road map is only offered with a server to fetch it through. */
export const looksOffered = (): MapLook[] => MAP_LOOKS.filter((l) => l !== "os" || API_URL !== "");

export const OS_SOURCE = "os-road";
// The server refuses closer zooms (OS Premium, charged); the map draws zoom 16 larger.
const OS_MIN_ZOOM = 7;
const OS_MAX_ZOOM = 16;
/** The OS map shows up to here; closer, the detailed map underneath. */
export const OS_UNTIL_ZOOM = 17;
export const OS_ATTRIBUTION = `Contains OS data © Crown copyright and database rights ${new Date().getFullYear()}`;

type Layer = StyleSpecification["layers"][number];
type Json = unknown;

const ROADS = "transportation";
// Shop, business and other clutter Plain leaves out.
const CLUTTER = new Set(["poi", "aerodrome_label", "mountain_peak", "housenumber"]);

/** A width (number, zoom stops or zoom curve) times f. Anything else is left as it is. */
export function scaleWidth(value: Json, f: number): Json {
  if (typeof value === "number") return value * f;
  if (Array.isArray(value) && value[0] === "interpolate" && Array.isArray(value[2]) && value[2][0] === "zoom") {
    return value.map((v, i) => (i > 3 && i % 2 === 0 && typeof v === "number" ? v * f : v));
  }
  if (value && typeof value === "object" && Array.isArray((value as { stops?: unknown }).stops)) {
    const v = value as { stops: [number, number][] };
    return { ...v, stops: v.stops.map(([z, w]) => [z, typeof w === "number" ? w * f : w]) };
  }
  return value;
}

const sourceLayer = (l: Layer) => (l as { "source-layer"?: string })["source-layer"];
const MAJOR = /motorway|trunk|primary|major/;

function clearLayer(l: Layer, theme: MapTheme): Layer {
  const night = theme === "night";
  if (l.type === "background") {
    return { ...l, paint: { ...l.paint, "background-color": night ? "#05080f" : "#f4f4f2" } };
  }
  if (l.type === "line" && sourceLayer(l) === ROADS) {
    const casing = /casing|outline/.test(l.id);
    const major = MAJOR.test(l.id);
    const color = casing ? (night ? "#000000" : "#3a3a3a") : night ? (major ? "#f1f4fa" : "#a9b3c6") : "#ffffff";
    return {
      ...l,
      paint: { ...l.paint, "line-color": color, "line-width": scaleWidth(l.paint?.["line-width"], 1.5) as never },
    };
  }
  if (l.type === "symbol") {
    return {
      ...l,
      paint: {
        ...l.paint,
        "text-color": night ? "#ffffff" : "#000000",
        "text-halo-color": night ? "#000000" : "#ffffff",
        "text-halo-width": 1.6,
      },
    };
  }
  return l;
}

// Night: the detailed day map (buildings, shops, road numbers and all)
// recoloured dark, rather than a separate dark map that leaves most of it out.
const NIGHT = {
  background: "#0f1520",
  water: "#0b2033",
  green: "#13241a",
  building: "#1d2534",
  buildingTop: "#252e3e",
  land: "#121925",
  casing: "#06090f",
  major: "#8a7440",
  primary: "#6b6452",
  secondary: "#4e5769",
  minor: "#3a4355",
  rail: "#3e4556",
  waterway: "#163454",
  boundary: "#5c667a",
  halo: "#0b1019",
};
const GREEN = /park|grass|wood|forest|garden|pitch|cemetery|meadow|scrub/;

function nightLayer(l: Layer): Layer {
  const id = l.id;
  const src = sourceLayer(l) ?? "";
  switch (l.type) {
    case "background":
      return { ...l, paint: { ...l.paint, "background-color": NIGHT.background } };
    case "fill": {
      const color =
        src === "water" || /water/.test(id)
          ? NIGHT.water
          : src === "building" || /building/.test(id)
            ? NIGHT.building
            : src === "park" || GREEN.test(id)
              ? NIGHT.green
              : NIGHT.land;
      return { ...l, paint: { ...l.paint, "fill-color": color, "fill-outline-color": NIGHT.halo } };
    }
    case "fill-extrusion":
      return { ...l, paint: { ...l.paint, "fill-extrusion-color": NIGHT.buildingTop } };
    case "line": {
      let color = NIGHT.minor;
      if (src === "transportation") {
        if (/casing|outline/.test(id)) color = NIGHT.casing;
        else if (/motorway|trunk/.test(id)) color = NIGHT.major;
        else if (/primary/.test(id)) color = NIGHT.primary;
        else if (/secondary|tertiary/.test(id)) color = NIGHT.secondary;
        else if (/rail|transit/.test(id)) color = NIGHT.rail;
      } else if (src === "waterway" || /water/.test(id)) color = NIGHT.waterway;
      else if (src === "boundary" || /boundary/.test(id)) color = NIGHT.boundary;
      return { ...l, paint: { ...l.paint, "line-color": color } };
    }
    case "symbol": {
      // Road number shields keep their own colours: dark text on a light badge.
      if (/shield/.test(id)) return { ...l, paint: { ...l.paint, "icon-opacity": 0.85 } };
      const text =
        src === "place"
          ? "#e3e9f3"
          : src === "transportation_name"
            ? "#c4ccda"
            : src === "water_name"
              ? "#6f93bb"
              : src === "poi"
                ? "#9fabc0"
                : "#b5bfd0";
      return {
        ...l,
        paint: { ...l.paint, "text-color": text, "text-halo-color": NIGHT.halo, "text-halo-width": 1.4, "icon-opacity": 0.8 },
      };
    }
    case "raster":
    case "hillshade":
      return l.type === "raster" ? { ...l, paint: { ...l.paint, "raster-brightness-max": 0.35 } } : { ...l, layout: { ...l.layout, visibility: "none" } };
    default:
      return l;
  }
}

/** The day style recoloured for night. */
export function nightify(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.map(nightLayer) };
}

function osLayers(theme: MapTheme): { source: StyleSpecification["sources"][string]; layer: Layer } {
  return {
    source: {
      type: "raster",
      tiles: [`${API_URL}/v1/os-maps/Road/{z}/{x}/{y}.png`],
      tileSize: 256,
      minzoom: OS_MIN_ZOOM,
      maxzoom: OS_MAX_ZOOM,
      attribution: OS_ATTRIBUTION,
    },
    layer: {
      id: OS_SOURCE,
      type: "raster",
      source: OS_SOURCE,
      minzoom: OS_MIN_ZOOM,
      // Past OS's free zooms its tiles only blur: closer in, the detailed map
      // (door numbers and all) underneath takes over.
      maxzoom: OS_UNTIL_ZOOM,
      // At night, light and dark swapped (white streets turn dark) and the
      // colours turned back round, rather than a dimmed light map glaring.
      paint:
        theme === "night"
          ? {
              "raster-brightness-min": 0.92,
              "raster-brightness-max": 0.08,
              "raster-hue-rotate": 180,
              "raster-saturation": -0.3,
            }
          : {},
    },
  };
}

/** The standard style changed to the look. Standard is returned as it is. */
export function restyle(style: StyleSpecification, look: MapLook, theme: MapTheme): StyleSpecification {
  if (look === "standard") return style;
  if (look === "clear") return { ...style, layers: style.layers.map((l) => clearLayer(l, theme)) };
  if (look === "plain") return { ...style, layers: style.layers.filter((l) => !CLUTTER.has(sourceLayer(l) ?? "")) };
  const os = osLayers(theme);
  // Over all of the standard map, which shows only where the OS map has no tile.
  return { ...style, sources: { ...style.sources, [OS_SOURCE]: os.source }, layers: [...style.layers, os.layer] };
}

// Styles fetched once a launch, by URL.
const fetched = new Map<string, Promise<StyleSpecification>>();
function styleJson(base: string): Promise<StyleSpecification> {
  if (base.trim().startsWith("{")) return Promise.resolve(JSON.parse(base) as StyleSpecification);
  let p = fetched.get(base);
  if (!p) {
    p = fetch(base).then((r) => {
      if (!r.ok) throw new Error(`style ${r.status}`);
      return r.json() as Promise<StyleSpecification>;
    });
    p.catch(() => fetched.delete(base));
    fetched.set(base, p);
  }
  return p;
}

/**
 * The style to draw: `base` (a URL, or a style's JSON text for the offline
 * map) changed to the look. At night it's made from `day` (the detailed day
 * style) recoloured dark. Standard by day is `base` itself; anything else
 * shows `base` until it's ready, or if it can't be made.
 */
export function useMapStyle(base: string, look: MapLook, theme: MapTheme, day?: string): string | StyleSpecification {
  const [made, setMade] = useState<{ key: string; style: StyleSpecification } | null>(null);
  const fromDay = theme === "night" && !!day;
  const plain = look === "standard" && !fromDay;
  const source = fromDay ? day! : base;
  const key = `${look}|${theme}|${source}`;
  useEffect(() => {
    if (plain) return;
    let live = true;
    styleJson(source)
      .then((s) => live && setMade({ key, style: restyle(fromDay ? nightify(s) : s, look, theme) }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [source, look, theme, key, plain, fromDay]);
  return !plain && made?.key === key ? made.style : base;
}
