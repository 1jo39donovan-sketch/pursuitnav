// The ways into buildings by a point (places/extract_entrances.py, built
// weekly with the map): asked for when a crew picks a door, so the route can
// end at the entrance rather than the middle of the building. Kept in memory
// in a grid of ~100 m cells; read again when the weekly file changes.
import { readFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

export interface Entrance {
  lat: number;
  lng: number;
  /** OSM's entrance value: main, yes, staircase, home, service… */
  kind: string;
  /** "A", "Block 2" */
  ref: string;
  name: string;
  housenumber: string;
  street: string;
  /** Flats it serves, e.g. "1-24". */
  flats: string;
}

// ~110 m north-south, ~70 m east-west in London.
const CELL = 0.001;
const cellKey = (lat: number, lng: number) => `${Math.floor(lat / CELL)},${Math.floor(lng / CELL)}`;

export function parseEntrances(text: string): Map<string, Entrance[]> {
  const grid = new Map<string, Entrance[]>();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [lat5, lng5, kind = "", ref = "", name = "", housenumber = "", street = "", flats = ""] = line.split("|");
    const lat = Number(lat5) / 1e5;
    const lng = Number(lng5) / 1e5;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = cellKey(lat, lng);
    const list = grid.get(key);
    const e = { lat, lng, kind, ref, name, housenumber, street, flats };
    if (list) list.push(e);
    else grid.set(key, [e]);
  }
  return grid;
}

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** Entrances within `radius` metres of the point, nearest first. */
export function entrancesNear(grid: Map<string, Entrance[]>, at: { lat: number; lng: number }, radius = 60) {
  const out: (Entrance & { metres: number })[] = [];
  const cy = Math.floor(at.lat / CELL);
  const cx = Math.floor(at.lng / CELL);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const e of grid.get(`${cy + dy},${cx + dx}`) ?? []) {
        const m = metres(at, e);
        if (m <= radius) out.push({ ...e, metres: Math.round(m) });
      }
    }
  }
  return out.sort((a, b) => a.metres - b.metres).slice(0, 12);
}

/** Loads the file when first asked and again when it changes; null if it isn't built yet. */
export function entranceFinder(path: string | undefined) {
  let loaded: { mtimeMs: number; grid: Map<string, Entrance[]> } | null = null;
  return async (at: { lat: number; lng: number }) => {
    const info = path ? await stat(path).catch(() => null) : null;
    if (!path || !info) return null;
    if (loaded?.mtimeMs !== info.mtimeMs) {
      loaded = { mtimeMs: info.mtimeMs, grid: parseEntrances(gunzipSync(await readFile(path)).toString("utf8")) };
    }
    return entrancesNear(loaded.grid, at);
  };
}
