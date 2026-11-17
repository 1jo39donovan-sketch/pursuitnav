// Police stations (custody suites marked), fire and ambulance stations, A&E,
// courts and prisons on every map: where a crew takes someone, meets up or
// gets sent from, and landmarks they all know. A letter badge each, the name
// beside it closer in. From the places file on the phone, so offline too.
import type { StyleSpecification } from "@maplibre/maplibre-react-native";

import { CUSTODY_SUITES, custodyStation } from "../area/custody";
import type { PointOfInterest } from "../search/places";
import type { MapTheme } from "../session/SessionProvider";

type Layer = StyleSpecification["layers"][number];

export type ServiceKind = "police" | "custody" | "fire" | "ambulance" | "ae" | "court" | "prison";

const KIND_OF_TYPE: Record<string, ServiceKind> = {
  "Police station": "police",
  "Fire station": "fire",
  "Ambulance station": "ambulance",
  "Hospital with A&E": "ae",
  Court: "court",
  Prison: "prison",
};

export const SERVICE_STYLE: Record<ServiceKind, { letter: string; colour: string }> = {
  police: { letter: "P", colour: "#1d4ed8" },
  custody: { letter: "C", colour: "#1d4ed8" },
  fire: { letter: "F", colour: "#dc2626" },
  ambulance: { letter: "A", colour: "#15803d" },
  ae: { letter: "A&E", colour: "#dc2626" },
  court: { letter: "Ct", colour: "#57534e" },
  prison: { letter: "Pr", colour: "#57534e" },
};

export const SERVICES_SOURCE = "br-services";
const SERVICES_PREFIX = "br-services-";

/** The place types drawn as services. */
export const SERVICE_TYPES: ReadonlySet<string> = new Set(Object.keys(KIND_OF_TYPE));
/**
 * Also read, to find A&E: OSM often marks a hospital's A&E entrance but not
 * the hospital (the Whittington, 17 Nov 2026). A hospital with one within
 * AE_ENTRANCE_M counts as A&E; the entrances aren't drawn themselves.
 */
export const SERVICE_SOURCE_TYPES: ReadonlySet<string> = new Set([...SERVICE_TYPES, "Hospital", "A&E entrance"]);
const AE_ENTRANCE_M = 400;

const metresApart = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

/** The services among the places, as GeoJSON points with their kind; custody suites' stations as custody. */
export function servicePoints(pois: readonly PointOfInterest[]): GeoJSON.FeatureCollection {
  const entrances = pois.filter((p) => p.type === "A&E entrance");
  const hasAe = (p: PointOfInterest) => entrances.some((e) => metresApart(e, p) <= AE_ENTRANCE_M);
  const services = pois
    .filter((p) => KIND_OF_TYPE[p.type] || (p.type === "Hospital" && hasAe(p)))
    .map((p) => (p.type === "Hospital" ? { ...p, type: "Hospital with A&E" } : p));
  const custody = new Set<PointOfInterest>();
  for (const suite of CUSTODY_SUITES) {
    const station = custodyStation(suite, services);
    if (station) custody.add(station);
  }
  return {
    type: "FeatureCollection",
    features: services.map((p) => {
      const kind: ServiceKind = custody.has(p) ? "custody" : KIND_OF_TYPE[p.type]!;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: { name: p.name, kind, letter: SERVICE_STYLE[kind].letter, colour: SERVICE_STYLE[kind].colour },
      };
    }),
  };
}

/** The font the style already labels with, bold, so the glyphs are there offline too. */
function boldFont(style: StyleSpecification): string[] {
  for (const l of style.layers) {
    const f = (l.layout as { "text-font"?: unknown } | undefined)?.["text-font"];
    if (Array.isArray(f) && f.every((x) => typeof x === "string")) {
      return f.some((x: string) => /Bold/.test(x)) ? f : f.map((x: string) => x.replace(/Regular|Italic/, "Bold"));
    }
  }
  return ["Noto Sans Bold"];
}

/** The style with the services drawn on top (above transport), or as it was without any. */
export function withServices(
  style: StyleSpecification,
  theme: MapTheme,
  points: GeoJSON.FeatureCollection | null | undefined,
): StyleSpecification {
  const kept = style.layers.filter((l) => !l.id.startsWith(SERVICES_PREFIX));
  if (!points || points.features.length === 0) return { ...style, layers: kept };
  const night = theme === "night";
  const font = boldFont(style);
  const layers: Layer[] = [
    {
      id: `${SERVICES_PREFIX}badge`,
      type: "circle",
      source: SERVICES_SOURCE,
      minzoom: 11,
      paint: {
        "circle-color": ["get", "colour"] as never,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5, 14, 10, 17, 13] as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    },
    {
      id: `${SERVICES_PREFIX}letter`,
      type: "symbol",
      source: SERVICES_SOURCE,
      minzoom: 13,
      layout: {
        "text-field": ["get", "letter"] as never,
        "text-font": font,
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9, 17, 12] as never,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": "#ffffff" },
    },
    {
      id: `${SERVICES_PREFIX}label`,
      type: "symbol",
      source: SERVICES_SOURCE,
      minzoom: 14,
      layout: {
        "text-field": ["get", "name"] as never,
        "text-font": font,
        "text-size": 13,
        "text-anchor": "left",
        "text-offset": [1.2, 0],
        "text-max-width": 10,
        "text-optional": true,
      },
      paint: {
        "text-color": night ? "#f1f4fa" : "#111111",
        "text-halo-color": night ? "#0b1019" : "#ffffff",
        "text-halo-width": 2,
      },
    },
  ];
  // Over transport's stations, under nothing else of ours.
  return {
    ...style,
    sources: { ...style.sources, [SERVICES_SOURCE]: { type: "geojson", data: points } },
    layers: [...kept, ...layers],
  };
}
