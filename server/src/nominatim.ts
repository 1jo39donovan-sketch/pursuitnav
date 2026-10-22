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

export class NominatimClient implements PlacesClient {
  constructor(
    private readonly baseUrl: string,
    private readonly boroughs: BoroughLookup,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 8000,
  ) {}

  async search(query: string): Promise<Address[]> {
    const asked = parseQuery(query);
    const params = new URLSearchParams({
      q: asked.q,
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
    if (!Array.isArray(results)) return [];

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
