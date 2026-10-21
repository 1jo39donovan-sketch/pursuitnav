// Which London borough a point is in, from the borough boundaries in
// places/london-boroughs.geojson (the file the places build uses too).
import { readFileSync } from "node:fs";

import { BOROUGH_NAMES } from "./boroughs.js";

type Ring = [number, number][];
interface Area {
  name: string;
  /** Outer ring first, then holes, per polygon. */
  polygons: Ring[][];
  box: [number, number, number, number];
}

/** places/ beside src/ (development, tests) or dist/ (the API image copies it there). */
export const BOROUGHS_FILE = new URL("../places/london-boroughs.geojson", import.meta.url);

function inRing(ring: Ring, lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class BoroughLookup {
  private readonly areas: Area[];

  constructor(geojson: {
    features: { properties: { name: string }; geometry: { type: string; coordinates: unknown } }[];
  }) {
    this.areas = geojson.features
      .filter((f) => BOROUGH_NAMES.has(f.properties.name))
      .map((f) => {
        const polygons = (
          f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates]
        ) as Ring[][];
        const xs = polygons.flatMap((p) => p[0]!.map((c) => c[0]));
        const ys = polygons.flatMap((p) => p[0]!.map((c) => c[1]));
        return {
          name: f.properties.name,
          polygons,
          box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as Area["box"],
        };
      });
  }

  static fromFile(file: URL | string = BOROUGHS_FILE): BoroughLookup {
    return new BoroughLookup(JSON.parse(readFileSync(file, "utf8")));
  }

  /** The borough name, or null outside Greater London. */
  at(lat: number, lng: number): string | null {
    for (const a of this.areas) {
      const [w, s, e, n] = a.box;
      if (lng < w || lng > e || lat < s || lat > n) continue;
      for (const [outer, ...holes] of a.polygons) {
        if (inRing(outer!, lng, lat) && !holes.some((h) => inRing(h, lng, lat))) return a.name;
      }
    }
    return null;
  }
}
