// Pieces shared by the phone (LiveMap.tsx) and browser (LiveMap.web.tsx) maps.
import type { LngLat } from "@maplibre/maplibre-react-native";

export interface MapRoute {
  id: string;
  shape: LngLat[];
  color: string;
  dashed?: boolean;
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
}

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
