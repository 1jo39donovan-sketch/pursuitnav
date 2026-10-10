// Where the car is and where it's heading, in London terms: borough, and
// the next borough or well-known area ahead. Works offline.
import type { Borough } from "../search/boroughs";
import { BOROUGHS } from "../search/boroughs";
import boundaries from "./london-boroughs.json";

type Ring = [number, number][];

interface BoroughShape {
  name: Borough;
  bbox: [number, number, number, number];
  polygons: Ring[][]; // each polygon: outer ring, then holes
}

const SHAPES: BoroughShape[] = (boundaries as GeoJSON.FeatureCollection).features.flatMap((f) => {
  const name = String(f.properties?.name ?? "");
  if (!(BOROUGHS as readonly string[]).includes(name)) return [];
  const g = f.geometry;
  const polygons = (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []) as Ring[][];
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polygons)
    for (const [x, y] of poly[0]!) {
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
  return [{ name: name as Borough, bbox: [w, s, e, n] as [number, number, number, number], polygons }];
});

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The London borough a point is in, or null outside London. */
export function boroughAt(lat: number, lng: number): Borough | null {
  for (const b of SHAPES) {
    const [w, s, e, n] = b.bbox;
    if (lng < w || lng > e || lat < s || lat > n) continue;
    for (const [outer, ...holes] of b.polygons) {
      if (inRing(lng, lat, outer!) && !holes.some((h) => inRing(lng, lat, h))) return b.name;
    }
  }
  return null;
}

/** N, NE, E… for a compass heading. */
export function cardinal(heading: number): string {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round((((heading % 360) + 360) % 360) / 45) % 8]!;
}

const EARTH_M = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** The point `metres` away along a compass heading. */
export function projectAhead(lat: number, lng: number, heading: number, metres: number): { lat: number; lng: number } {
  const d = metres / EARTH_M;
  const h = toRad(heading);
  const la1 = toRad(lat);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(h));
  const lo2 = toRad(lng) + Math.atan2(Math.sin(h) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: toDeg(la2), lng: toDeg(lo2) };
}

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const h =
    Math.sin(toRad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/** A named neighbourhood (Brixton, Angel…), from the places file. */
export interface NamedArea {
  name: string;
  lat: number;
  lng: number;
}

// Look 0.5–2 km ahead: far enough to be useful to relay, close enough to be soon.
const AHEAD_STEPS_M = [500, 1000, 1500, 2000];
const AREA_CONE_DEG = 35;

/**
 * Where the car is generally heading: the next borough within 2 km if it
 * crosses one, otherwise the well-known area most nearly straight ahead.
 */
export function generallyTowards(
  lat: number,
  lng: number,
  heading: number,
  areas: readonly NamedArea[] = [],
): string | null {
  const here = boroughAt(lat, lng);
  for (const m of AHEAD_STEPS_M) {
    const p = projectAhead(lat, lng, heading, m);
    const b = boroughAt(p.lat, p.lng);
    if (b !== here) return b ?? "Leaving London";
  }
  // Same borough all the way: name the area ahead instead.
  const origin = { lat, lng };
  let best: { name: string; score: number } | null = null;
  for (const a of areas) {
    const d = distance(origin, a);
    if (d < 400 || d > 3000) continue;
    const off = Math.abs(((bearing(origin, a) - heading + 540) % 360) - 180);
    if (off > AREA_CONE_DEG) continue;
    // Prefer areas nearer the line of travel, then nearer 1.5 km.
    const score = off * 40 + Math.abs(d - 1500);
    if (!best || score < best.score) best = { name: a.name, score };
  }
  return best?.name ?? null;
}
