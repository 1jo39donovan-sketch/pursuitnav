// House numbers and streets from OpenStreetMap, through our own Nominatim
// (docker-compose.yml, scripts/build-geocoder.sh): imported from the same
// London extract as the routing map, on the server's internal network, with
// no query logs. The public nominatim.openstreetmap.org isn't for this.
import { parseAddressQuery } from "./addressQuery.js";
import type { BoroughLookup } from "./boroughArea.js";
import { PlacesError, type Address, type AddressPrecision, type PlacesClient } from "./places.js";

/** The fields of a Nominatim jsonv2 result (addressdetails=1) we use. */
export interface NominatimResult {
  place_id: number;
  osm_type?: "node" | "way" | "relation";
  osm_id?: number;
  lat: string;
  lon: string;
  category: string;
  type: string;
  name?: string;
  importance?: number;
  /** With polygon_geojson=1: the object's shape (a building's outline, a node's point). */
  geojson?: { type: string };
  address?: {
    house_number?: string;
    road?: string;
    postcode?: string;
    [k: string]: string | undefined;
  };
}

/** Greater London, west,south,east,north, with a margin (the boundaries decide in the end). */
const LONDON_VIEWBOX = "-0.52,51.28,0.34,51.70";

const ABBREVIATIONS: Record<string, string> = {
  rd: "road",
  st: "street",
  ave: "avenue",
  av: "avenue",
  ln: "lane",
  gdns: "gardens",
  sq: "square",
  pl: "place",
  cres: "crescent",
  ter: "terrace",
  terr: "terrace",
  gr: "grove",
  ct: "court",
  cl: "close",
  hwy: "highway",
  pk: "park",
};

/** "Caledonian Rd." → "caledonian road", for comparing street names. */
export function normaliseStreet(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w)
    .join(" ");
}

export interface ParsedQuery {
  /** "Flat 3", kept for the label. */
  unit?: string;
  /** What's sent to Nominatim. */
  q: string;
  number?: string;
  street?: string;
}

/**
 * What to ask Nominatim: the number and street, without a flat (not in
 * OpenStreetMap; kept for the label) or a postcode (one that's wrong, or
 * that OpenStreetMap files the door under differently, and it finds nothing).
 */
export function parseQuery(query: string): ParsedQuery {
  const p = parseAddressQuery(query);
  if (!p.text) return { unit: p.unit, q: p.postcode ?? p.outward ?? query.trim() };
  if (!p.number) return { unit: p.unit, q: p.text };
  // The street is up to the first comma: "53 Caledonian Road, Islington".
  const street = p.text.split(",")[0]!.trim();
  return { unit: p.unit, q: `${p.number} ${p.text}`, number: p.number, street };
}

/**
 * An interpolated number: a point worked out along an address line, not a
 * mapped door. Its category is the same as a mapped building's (place/house),
 * so it's told apart by shape: a way that's only a point. A mapped building
 * comes back as its outline, a mapped node as a point on a node.
 */
export function interpolated(r: NominatimResult): boolean {
  return r.osm_type === "way" && r.geojson?.type === "Point";
}

function osmId(r: NominatimResult): string {
  if (r.osm_type && r.osm_id !== undefined) return `osm:${r.osm_type[0]!.toUpperCase()}${r.osm_id}`;
  return `osm:place-${r.place_id}`;
}

export function classify(
  r: NominatimResult,
  asked: ParsedQuery,
): { precision: AddressPrecision; label: string } | null {
  const a = r.address ?? {};
  if (r.category === "place" && r.type === "postcode") {
    return { precision: "postcode", label: a.postcode ?? r.name ?? "" };
  }
  const prefix = asked.unit ? `${asked.unit}, ` : "";
  if (a.house_number && a.road) {
    // Only the number asked for counts: anything else would put the crew at the wrong door.
    if (!asked.number)
      return { precision: "place", label: [r.name, `${a.house_number} ${a.road}`].filter(Boolean).join(", ") };
    const sameNumber = a.house_number.toLowerCase().replace(/\s/g, "") === asked.number;
    const street = normaliseStreet(asked.street ?? "");
    const sameStreet = street !== "" && normaliseStreet(a.road).startsWith(street);
    if (!sameNumber || !sameStreet) return null;
    if (interpolated(r)) {
      return { precision: "road", label: `${prefix}${a.house_number} ${a.road} (estimated point on the road)` };
    }
    return { precision: "door", label: `${prefix}${a.house_number} ${a.road}` };
  }
  if (r.category === "highway") {
    // A street found for a numbered address is labelled as the street alone:
    // the number isn't mapped, and the label shouldn't suggest it was found.
    return { precision: "road", label: a.road ?? r.name ?? "" };
  }
  // Something with no name of its own (a building, a plot of land) says
  // nothing a crew can use: labelled by its road it was just the road again,
  // once for every building on it.
  if (!r.name) return null;
  return { precision: "place", label: a.road && r.name !== a.road ? `${r.name}, ${a.road}` : r.name };
}

/** A house number further than this from the car isn't "where it is". */
export const NEAREST_DOOR_M = 40;

function metresBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const x = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.hypot(x, y) * 6371000;
}

export type NearestDoor = (lat: number, lng: number) => Promise<string | null>;
export type WhereIs = (lat: number, lng: number) => Promise<{ door: string | null; road: string | null; postcode: string | null }>;

/**
 * Pursuit asks every second or so while the car moves a few metres: answers
 * are kept a minute for each ~10 m square, so Nominatim is asked far less.
 */
export function cachedNearestDoor(find: NearestDoor, now: () => number = Date.now, ttlMs = 60_000): NearestDoor {
  const cache = new Map<string, { at: number; value: string | null }>();
  return async (lat, lng) => {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = await find(lat, lng).catch(() => null);
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: now(), value });
    return value;
  };
}

/** A mapped door near the one asked for: its number (the digits) and where it is. */
export interface Neighbour {
  number: number;
  lat: number;
  lng: number;
}

/** Neighbours this far apart are on different stretches of the road (or across a junction). */
const NEIGHBOURS_WITHIN_M = 250;
/** Numbers asked for either side of an unmapped one: 2, 4 and 6 away, same side of the road. */
export const NEIGHBOUR_STEPS = [2, 4, 6];

/**
 * Where an unmapped house number is, from mapped doors on the same side of
 * the same road: between the nearest lower and higher numbers (by number),
 * or at the next-door house if only that one is mapped. Null when they're
 * too far apart to trust. Never a guess from the other side of the road.
 */
export function estimateDoor(
  wanted: number,
  neighbours: readonly Neighbour[],
): { lat: number; lng: number; between: [number, number] | null; nextTo: number | null } | null {
  const same = neighbours.filter((n) => n.number % 2 === wanted % 2 && n.number !== wanted);
  const lo = same.filter((n) => n.number < wanted).sort((a, b) => b.number - a.number)[0];
  const hi = same.filter((n) => n.number > wanted).sort((a, b) => a.number - b.number)[0];
  if (lo && hi && metresBetween(lo.lat, lo.lng, hi.lat, hi.lng) <= NEIGHBOURS_WITHIN_M) {
    const t = (wanted - lo.number) / (hi.number - lo.number);
    return { lat: lo.lat + (hi.lat - lo.lat) * t, lng: lo.lng + (hi.lng - lo.lng) * t, between: [lo.number, hi.number], nextTo: null };
  }
  const next = same.find((n) => Math.abs(n.number - wanted) === 2);
  return next ? { lat: next.lat, lng: next.lng, between: null, nextTo: next.number } : null;
}

export class NominatimClient implements PlacesClient {
  constructor(
    private readonly baseUrl: string,
    private readonly boroughs: BoroughLookup,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 8000,
  ) {}

  async search(query: string): Promise<Address[]> {
    const asked = parseQuery(query);
    const found = this.toAddresses(await this.results(asked.q), asked);
    // A numbered address OSM doesn't have: worked out from the doors either side.
    if (asked.number && asked.street && !found.some((a) => a.precision === "door")) {
      const estimate = await this.estimate(asked).catch(() => null);
      if (estimate) return [estimate, ...found];
    }
    return found;
  }

  /** The doors 2, 4 and 6 numbers either side, mapped in OSM, and the estimate from them. */
  private async estimate(asked: ParsedQuery): Promise<Address | null> {
    const wanted = parseInt(asked.number!, 10);
    if (!Number.isFinite(wanted)) return null;
    const numbers = NEIGHBOUR_STEPS.flatMap((d) => [wanted - d, wanted + d]).filter((n) => n > 0);
    const found = await Promise.all(
      numbers.map(async (n) => {
        const near: ParsedQuery = { q: `${n} ${asked.street}`, number: String(n), street: asked.street };
        const r = (await this.results(near.q).catch(() => [])).find(
          (x) => !interpolated(x) && classify(x, near)?.precision === "door",
        );
        return r ? { n, r } : null;
      }),
    );
    const doors = found.filter((f): f is { n: number; r: NominatimResult } => f !== null);
    // All on one road: the first one found decides which (the same name can be elsewhere in London).
    const road = doors[0]?.r.address?.road;
    const onRoad = doors.filter((d) => d.r.address?.road === road);
    const at = estimateDoor(
      wanted,
      onRoad.map((d) => ({ number: d.n, lat: Number(d.r.lat), lng: Number(d.r.lon) })),
    );
    if (!at || !road) return null;
    const borough = this.boroughs.at(at.lat, at.lng);
    if (!borough) return null;
    const prefix = asked.unit ? `${asked.unit}, ` : "";
    const how = at.between ? `estimated between ${at.between[0]} and ${at.between[1]}` : `estimated next to ${at.nextTo}`;
    const nearest = onRoad.find((d) => d.n === (at.between?.[0] ?? at.nextTo));
    return {
      id: `osm:est-${normaliseStreet(road).replace(/\s/g, "-")}-${asked.number}`,
      source: "osm",
      precision: "door",
      label: `${prefix}${asked.number} ${road} (${how})`,
      postcode: nearest?.r.address?.postcode ?? "",
      borough,
      lat: at.lat,
      lng: at.lng,
      match: 0.6,
    };
  }

  /** Nominatim's answers for a query. */
  private async results(q: string): Promise<NominatimResult[]> {
    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      addressdetails: "1",
      countrycodes: "gb",
      viewbox: LONDON_VIEWBOX,
      bounded: "1",
      limit: "10",
      // Shapes, simplified (about 10 m), only to tell interpolated numbers from mapped doors.
      polygon_geojson: "1",
      polygon_threshold: "0.0001",
    });
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/search?${params}`, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new PlacesError("Nominatim unreachable", 503);
    }
    if (res.status === 400) return [];
    if (!res.ok) throw new PlacesError(`Nominatim returned ${res.status}`, res.status === 429 ? 429 : 503);
    let results: NominatimResult[];
    try {
      results = (await res.json()) as NominatimResult[];
    } catch {
      throw new PlacesError("Nominatim sent an unreadable answer", 503);
    }
    return Array.isArray(results) ? results : [];
  }

  private toAddresses(results: NominatimResult[], asked: ParsedQuery): Address[] {
    return results.flatMap((r) => {
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      const borough = this.boroughs.at(lat, lng);
      const what = classify(r, asked);
      if (!borough || !what) return [];
      return [
        {
          id: osmId(r),
          source: "osm" as const,
          precision: what.precision,
          label: what.label,
          postcode: r.address?.postcode ?? "",
          borough,
          lat,
          lng,
          match: Math.min(1, Math.max(0, r.importance ?? 0.5)),
        },
      ];
    });
  }

  /**
   * What's at a point: the nearest mapped house number (as "123 Maida Vale"),
   * the road and the postcode, for "Where am I" and Pursuit. door is null
   * where no number is mapped close by (within NEAREST_DOOR_M): never a guess.
   */
  async reverse(lat: number, lng: number): Promise<{ door: string | null; road: string | null; postcode: string | null }> {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "jsonv2",
      addressdetails: "1",
      // Buildings and addresses, not just the street.
      zoom: "18",
    });
    const res = await this.fetchImpl(`${this.baseUrl}/reverse?${params}`, { signal: AbortSignal.timeout(1500) });
    const r = res.ok ? ((await res.json().catch(() => null)) as NominatimResult | null) : null;
    const a = r?.address;
    const close = !!r && metresBetween(lat, lng, Number(r.lat), Number(r.lon)) <= NEAREST_DOOR_M;
    return {
      door: a?.house_number && a.road && close ? `${a.house_number.split(/[;,]/)[0]!.trim()} ${a.road}` : null,
      road: a?.road ?? null,
      postcode: a?.postcode ?? null,
    };
  }

  /** The house number nearest a point, for Pursuit; null where none is mapped close by. */
  async nearestDoor(lat: number, lng: number): Promise<string | null> {
    return (await this.reverse(lat, lng)).door;
  }

  /** True when Nominatim is up and its database is ready. */
  async ready(timeoutMs = 2000): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/status`, { signal: AbortSignal.timeout(timeoutMs) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
