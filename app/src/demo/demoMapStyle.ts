import type { StyleSpecification } from "maplibre-gl";

import { colors } from "../theme";
import labels from "./borough-labels.json";
import boroughs from "./london-boroughs.json";

// Offline map for demo builds: London's 33 borough outlines on the app's
// navy. No street detail; the real app uses OpenFreeMap tiles.
export const demoMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    boroughs: {
      type: "geojson",
      data: boroughs as GeoJSON.FeatureCollection,
      attribution: "Borough boundaries © OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#0f1728" } },
    {
      id: "borough-fill",
      type: "fill",
      source: "boroughs",
      paint: { "fill-color": colors.panel, "fill-opacity": 0.9 },
    },
    {
      id: "borough-line",
      type: "line",
      source: "boroughs",
      paint: { "line-color": "#3a4a6b", "line-width": 1.2 },
    },
  ],
};

/** Borough names with a point inside each borough, for HTML labels. */
export const demoBoroughLabels = (labels as GeoJSON.FeatureCollection<GeoJSON.Point>).features.map(
  (f) => ({
    name: String(f.properties?.name ?? ""),
    lngLat: f.geometry.coordinates as [number, number],
  }),
);
