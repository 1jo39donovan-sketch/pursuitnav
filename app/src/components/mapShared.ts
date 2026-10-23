// Pieces shared by the phone (LiveMap.tsx) and browser (LiveMap.web.tsx) maps.
import type {
  CircleLayerSpecification,
  LineLayerSpecification,
  LngLat,
  SymbolLayerSpecification,
} from "@maplibre/maplibre-react-native";

import type { MapView } from "../session/SessionProvider";

export interface MapRoute {
  id: string;
  shape: LngLat[];
  color: string;
  dashed?: boolean;
}

/** Properties carried by each place marker feature. */
export interface MarkerProperties {
  name: string;
  type: string;
  address: string;
  borough: string;
  color: string;
}

export interface LiveMapProps {
  /** Rotate the map so the direction of travel points up (pursuit mini map). */
  headingUp?: boolean;
  /** North up, direction of travel up, or tilted 3D; overrides headingUp. */
  view?: MapView;
  /** Show the button that cycles the view (navigation and pursuit maps). */
  viewControl?: boolean;
  /** Where a blue-light route relies on a restriction: shown as a red "R". */
  restrictions?: LngLat[];
  /** Zoom in when slow (junctions, dense streets) and out when fast. */
  autoZoom?: boolean;
  /** + and − buttons. */
  zoomControl?: boolean;
  /** Bigger, brighter road names than the map style's own. */
  roadNames?: boolean;
  /** Show the vehicle as an arrow pointing the way it's going (navigation, pursuit). */
  vehicleArrow?: boolean;
  /** Named blocks and estates to label (points with a "name"), when zoomed in. */
  labels?: GeoJSON.FeatureCollection | null;
  /** Colleagues in a team session (points with a "name": their callsign), at every zoom. */
  team?: GeoJSON.FeatureCollection | null;
  /** Zoom used while following the officer's position. */
  followZoom?: number;
  /** Hide map controls for small embedded maps. */
  compact?: boolean;
  /**
   * Height of whatever floats over the top of the map (a search box): the
   * map's buttons start below it, and routes are framed clear of it.
   */
  overlayTop?: number;
  /** The same for a sheet over the bottom of the map: Recentre and the credit sit above it. */
  overlayBottom?: number;
  routes?: MapRoute[];
  /** A "Where am I" button with the map's buttons (Search). */
  onWhereAmI?: () => void;
  /** Navigating: with the map turned to the way of travel, the vehicle sits low on the screen to show the road ahead. */
  lookAhead?: boolean;
  destination?: LngLat | null;
  onLongPress?: (point: LngLat) => void;
  /** When this changes to a set of points, stop following and show them all. */
  fitTo?: LngLat[] | null;
  /** Place markers (points with MarkerProperties). */
  markers?: GeoJSON.FeatureCollection | null;
  onMarkerPress?: (marker: MarkerProperties, point: LngLat) => void;
}

/** Glyph font for marker labels; OpenFreeMap's styles serve Noto Sans. */
export const LABEL_FONT = ["Noto Sans Regular"];

export const EMPTY_COLLECTION: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Shared layer settings for place markers, so phone and browser look alike.
export const MARKER_CIRCLE_PAINT: CircleLayerSpecification["paint"] = {
  "circle-color": ["get", "color"],
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 15, 5, 18, 8],
  "circle-stroke-color": "#0c1220",
  "circle-stroke-width": 1.5,
  "circle-opacity": 0.95,
};

export const MARKER_LABEL_LAYOUT: SymbolLayerSpecification["layout"] = {
  "text-field": ["get", "name"],
  "text-font": LABEL_FONT,
  "text-size": 12,
  "text-offset": [0, 1.1],
  "text-anchor": "top",
  "text-max-width": 9,
  "text-optional": true,
};

export const MARKER_LABEL_PAINT: SymbolLayerSpecification["paint"] = {
  "text-color": "#e7ecf5",
  "text-halo-color": "#0c1220",
  "text-halo-width": 1.5,
};

/** Navigating with the map turned: the vehicle this far down from the middle, as a share of the map's height. */
export const LOOK_AHEAD = 0.45;

/** Routes: a solid line with a white edge, clear on the day and night maps. */
export const ROUTE_LINE_PAINT: LineLayerSpecification["paint"] = { "line-color": ["get", "color"], "line-width": 6 };
export const ROUTE_CASING_PAINT: LineLayerSpecification["paint"] = {
  "line-color": "#ffffff",
  "line-width": 10,
  "line-opacity": 0.9,
};
/** The route not picked out, under the other, on Search. */
export const ROUTE_ALT = "#8a97b0";

export function routesGeoJSON(routes: MapRoute[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: routes.map((r) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: r.shape },
      properties: { id: r.id, color: r.color, dashed: !!r.dashed },
    })),
  };
}

export function pointGeoJSON(point: LngLat | null | undefined): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: point ? [{ type: "Feature", geometry: { type: "Point", coordinates: point }, properties: {} }] : [],
  };
}

/** [west, south, east, north] around the points. */
export function boundsOf(points: LngLat[]): [number, number, number, number] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of points) {
    w = Math.min(w, lng);
    e = Math.max(e, lng);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  // Never frame less than ~300 m, or a single point zooms all the way in.
  const MIN_SPAN = 0.003;
  const padLng = Math.max(0, MIN_SPAN - (e - w)) / 2;
  const padLat = Math.max(0, MIN_SPAN - (n - s)) / 2;
  return [w - padLng, s - padLat, e + padLng, n + padLat];
}

export const FIT_PADDING = { top: 60, right: 40, bottom: 60, left: 40 };
export const FIT_DELAY_MS = 150;

/** Camera tilt and rotation for each view. */
export function cameraFor(view: MapView, course: number | null): { bearing: number; pitch: number } {
  if (view === "north" || course == null) return { bearing: 0, pitch: view === "3d" ? 55 : 0 };
  return { bearing: course, pitch: view === "3d" ? 55 : 0 };
}

export const RESTRICTION_RED = "#e5484d";

export const RESTRICTION_CIRCLE_PAINT: CircleLayerSpecification["paint"] = {
  "circle-radius": 11,
  "circle-color": RESTRICTION_RED,
  "circle-stroke-color": "#ffffff",
  "circle-stroke-width": 2,
};

export const RESTRICTION_LABEL_LAYOUT: SymbolLayerSpecification["layout"] = {
  "text-field": "R",
  "text-font": ["Noto Sans Bold"],
  "text-size": 13,
  "text-allow-overlap": true,
  "text-ignore-placement": true,
};

export const RESTRICTION_LABEL_PAINT: SymbolLayerSpecification["paint"] = { "text-color": "#ffffff" };

export function pointsGeoJSON(points: LngLat[] | undefined): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: (points ?? []).map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: {} })),
  };
}

/**
 * Extra zoom for the speed: closer in when crawling through junctions and
 * dense streets, further out at speed to see what's coming.
 */
export function speedZoom(speedMs: number | null): number {
  if (speedMs == null) return 0;
  const mph = speedMs * 2.23694;
  if (mph < 10) return 1;
  if (mph < 25) return 0.5;
  if (mph < 45) return 0;
  return -1;
}

/**
 * Road names drawn on top of the map style's own, bigger and brighter, so
 * the crew can always read the roads around them. Uses the street names in
 * OpenFreeMap's tiles ("openmaptiles" source).
 */
export const ROAD_NAME_SOURCE = "openmaptiles";
export const ROAD_NAME_SOURCE_LAYER = "transportation_name";
export const roadNameLayout: SymbolLayerSpecification["layout"] = {
  "symbol-placement": "line",
  "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
  "text-font": ["Noto Sans Bold"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 14, 12, 17, 16, 19, 19],
  "text-max-angle": 30,
  "symbol-spacing": 250,
};
export function roadNamePaint(theme: "night" | "day"): SymbolLayerSpecification["paint"] {
  return theme === "night"
    ? { "text-color": "#ffffff", "text-halo-color": "#0c1220", "text-halo-width": 2 }
    : { "text-color": "#111111", "text-halo-color": "#ffffff", "text-halo-width": 2 };
}

/** Block and estate names: blue, like their place colour, readable on either map. */
export const LABEL_LAYOUT: SymbolLayerSpecification["layout"] = {
  "text-field": ["get", "name"],
  "text-font": ["Noto Sans Bold"],
  "text-size": 13,
  "text-max-width": 8,
  "text-allow-overlap": false,
};
export function labelPaint(theme: "night" | "day"): SymbolLayerSpecification["paint"] {
  return theme === "night"
    ? { "text-color": "#93c5fd", "text-halo-color": "#0c1220", "text-halo-width": 2 }
    : { "text-color": "#1d4ed8", "text-halo-color": "#ffffff", "text-halo-width": 2 };
}

// Colleagues: a green dot with their callsign beside it, never hidden by other labels.
export const TEAM_COLOR = "#22c55e";
export const TEAM_CIRCLE_PAINT: CircleLayerSpecification["paint"] = {
  "circle-color": TEAM_COLOR,
  "circle-radius": 7,
  "circle-stroke-color": "#ffffff",
  "circle-stroke-width": 2,
};
export const TEAM_LABEL_LAYOUT: SymbolLayerSpecification["layout"] = {
  "text-field": ["get", "name"],
  "text-font": ["Noto Sans Bold"],
  "text-size": 14,
  "text-offset": [0, -1.4],
  "text-allow-overlap": true,
  "text-ignore-placement": true,
};
export function teamLabelPaint(theme: "night" | "day"): SymbolLayerSpecification["paint"] {
  return theme === "night"
    ? { "text-color": "#86efac", "text-halo-color": "#0c1220", "text-halo-width": 2 }
    : { "text-color": "#15803d", "text-halo-color": "#ffffff", "text-halo-width": 2 };
}

/** Points with a name, for the labels prop. */
export function namedPoints(items: { name: string; lat: number; lng: number }[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { name: p.name },
    })),
  };
}

export const VEHICLE_IMAGE = "vehicle-arrow";

/** The vehicle's position; with a course, drawn as an arrow turned that way. */
export function vehicleFeature(lng: number, lat: number, course: number | null): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: course != null ? { course } : {},
  };
}

export const ARROW_LAYOUT: SymbolLayerSpecification["layout"] = {
  "icon-image": VEHICLE_IMAGE,
  "icon-size": 0.45,
  "icon-rotate": ["get", "course"],
  "icon-rotation-alignment": "map",
  "icon-pitch-alignment": "map",
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
};
