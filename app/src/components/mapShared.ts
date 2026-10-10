// Pieces shared by the phone (LiveMap.tsx) and browser (LiveMap.web.tsx) maps.
import type {
  CircleLayerSpecification,
  LngLat,
  SymbolLayerSpecification,
} from "@maplibre/maplibre-react-native";

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
  /** Zoom used while following the officer's position. */
  followZoom?: number;
  /** Hide map controls for small embedded maps. */
  compact?: boolean;
  routes?: MapRoute[];
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
