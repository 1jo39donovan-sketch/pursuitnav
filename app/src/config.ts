import type { LngLat, LngLatBounds } from "@maplibre/maplibre-react-native";

// Everything specific to the area the app covers lives here, so going
// UK-wide later means adding regions rather than hunting for London.
export interface RegionConfig {
  id: string;
  name: string;
  /** Where the map opens before the first GPS fix arrives. */
  defaultCentre: LngLat;
  defaultZoom: number;
  /** The camera can't be panned far outside this box. */
  maxBounds: LngLatBounds;
}

export const LONDON: RegionConfig = {
  id: "london",
  name: "London",
  defaultCentre: [-0.1276, 51.5072],
  defaultZoom: 11,
  maxBounds: [-0.8, 51.2, 0.6, 51.8],
};

export const region = LONDON;

// Free vector tiles from OpenFreeMap (OpenStreetMap data). Swap for a
// self-hosted Protomaps extract later without touching the map component.
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
