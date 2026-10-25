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
      // Dimmed at night, so it doesn't dazzle in a dark car.
      paint: theme === "night" ? { "raster-brightness-max": 0.6, "raster-saturation": -0.2 } : {},
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
 * map) changed to the look. Standard is `base` itself; the others show the
 * standard map until theirs is ready, or if it can't be made.
 */
export function useMapStyle(base: string, look: MapLook, theme: MapTheme): string | StyleSpecification {
  const [made, setMade] = useState<{ key: string; style: StyleSpecification } | null>(null);
  const key = `${look}|${theme}|${base}`;
  useEffect(() => {
    if (look === "standard") return;
    let live = true;
    styleJson(base)
      .then((s) => live && setMade({ key, style: restyle(s, look, theme) }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [base, look, theme, key]);
  return look !== "standard" && made?.key === key ? made.style : base;
}
