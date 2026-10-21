// House numbers and streets from OpenStreetMap, through our own Nominatim
// (docker-compose.yml, scripts/build-geocoder.sh): imported from the same
// London extract as the routing map, on the server's internal network, with
// no query logs. The public nominatim.openstreetmap.org isn't for this.
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
  address?: {
    house_number?: string;
    road?: string;
    postcode?: string;
    [k: string]: string | undefined;
  };
}

/** Greater London, west,south,east,north, with a margin (the boundaries decide in the end). */
const LONDON_VIEWBOX = "-0.52,51.28,0.34,51.70";

/** "Flat 3, " / "Unit 2 " at the front: not in OpenStreetMap, so searched without, kept in the label. */
const SUB_UNIT = /^\s*((?:flat|unit|apartment|apt|room|suite|studio)\s+[\w-]+)\s*,?\s*/i;
/** "53 Caledonian Road", "53a, Caledonian Road". */
const NUMBERED = /^(\d+[a-z]?)\s*,?\s+(.+)$/i;

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

export function parseQuery(query: string): ParsedQuery {
  const unitMatch = SUB_UNIT.exec(query);
  const unit = unitMatch?.[1];
  const q = unitMatch ? query.slice(unitMatch[0].length).trim() : query.trim();
  const numbered = NUMBERED.exec(q);
  if (!numbered) return { unit, q };
  // The street is up to the first comma: "53 Caledonian Road, N7 8LA".
  const street = numbered[2]!.split(",")[0]!.trim();
  return { unit, q, number: numbered[1]!.toLowerCase(), street };
}

/** An interpolated number: a point worked out along an address line, not a mapped door. */
function interpolated(r: NominatimResult): boolean {
  return r.osm_type === "way" && r.category === "place" && r.type === "house";
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
    const road = a.road ?? r.name ?? "";
    // A street found for a numbered address: the app warns it's the road, not the door.
    return { precision: "road", label: asked.number ? `${prefix}${asked.number} ${road}` : road };
  }
  const name = r.name || a.road;
  if (!name) return null;
  return { precision: "place", label: r.name && a.road && r.name !== a.road ? `${r.name}, ${a.road}` : name };
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
