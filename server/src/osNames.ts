// Postcodes, roads and named places from the OS Names API: OS OpenData,
// free under the Open Government Licence, but it needs a (free) key from an
// OS Data Hub project. Results come in British National Grid; bng.ts turns
// them into latitude and longitude.
import { bngToWgs84, LONDON_BNG_BOUNDS } from "./bng.js";
import type { BoroughLookup } from "./boroughArea.js";
import { BOROUGH_NAMES } from "./boroughs.js";
import { parseAddressQuery } from "./addressQuery.js";
import { PlacesError, type Address, type AddressPrecision, type PlacesClient } from "./places.js";

/** The fields of an OS Names GAZETTEER_ENTRY we use. */
export interface GazetteerEntry {
  ID: string;
  NAME1: string;
  TYPE?: string;
  LOCAL_TYPE: string;
  GEOMETRY_X: number;
  GEOMETRY_Y: number;
  POSTCODE_DISTRICT?: string;
  POPULATED_PLACE?: string;
  DISTRICT_BOROUGH?: string;
  COUNTY_UNITARY?: string;
}

interface NamesResponse {
  results?: Array<{ GAZETTEER_ENTRY?: GazetteerEntry }>;
}

const ROAD_TYPES = new Set(["Named_Road", "Section_Of_Named_Road", "Numbered_Road"]);

export function precisionFor(localType: string): AddressPrecision {
  if (localType === "Postcode") return "postcode";
  if (ROAD_TYPES.has(localType)) return "road";
  return "place";
}

export class OsNamesClient implements PlacesClient {
  constructor(
    private readonly key: string,
    private readonly boroughs: BoroughLookup,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = "https://api.os.uk/search/names/v1",
    private readonly timeoutMs = 8000,
  ) {}

  async search(query: string): Promise<Address[]> {
    const q = parseAddressQuery(query);
    // Only what OS Names can answer: a postcode (exactly), and the street or
    // place without its house number. Never the whole line: it guesses at
    // every part, and a "53" or "8LA" brings back unrelated postcodes.
    const [postcodes, named] = await Promise.all([
      q.postcode ? this.find(q.postcode, "LOCAL_TYPE:Postcode") : Promise.resolve([]),
      q.text.length >= 2 ? this.find(q.text) : Promise.resolve([]),
    ]);
    const exact = q.postcode?.replace(/\s/g, "");
    const kept = [
      ...postcodes.filter((a) => a.postcode.replace(/\s/g, "") === exact),
      // Postcodes it guessed at from a street name aren't what was asked for.
      ...named.filter((a) => a.precision !== "postcode"),
    ];
    // "Caledonian Road, N7": that district's sections of the road first.
    if (!q.outward) return kept;
    const inDistrict = (a: Address) => a.label.endsWith(`, ${q.outward}`);
    return [...kept.filter(inDistrict), ...kept.filter((a) => !inDistrict(a))];
  }

  private async find(text: string, fq?: string): Promise<Address[]> {
    const params = new URLSearchParams({
      query: text,
      maxresults: "50",
      bounds: LONDON_BNG_BOUNDS.join(","),
      key: this.key,
    });
    if (fq) params.set("fq", fq);

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/find?${params}`, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      // Never the URL: it holds the key.
      throw new PlacesError("OS Names unreachable", 503);
    }
    // OS answers 400 for a query it can't search; that's no matches.
    if (res.status === 400) return [];
    if (!res.ok) throw new PlacesError(`OS Names returned ${res.status}`, res.status === 429 ? 429 : 503);
    let data: NamesResponse;
    try {
      data = (await res.json()) as NamesResponse;
    } catch {
      throw new PlacesError("OS Names sent an unreadable answer", 503);
    }

    const entries = (data.results ?? []).flatMap((r) => (r.GAZETTEER_ENTRY ? [r.GAZETTEER_ENTRY] : []));
    return entries.flatMap((g, i) => {
      if (typeof g.GEOMETRY_X !== "number" || typeof g.GEOMETRY_Y !== "number") return [];
      const { lat, lng } = bngToWgs84(g.GEOMETRY_X, g.GEOMETRY_Y);
      const named = [g.DISTRICT_BOROUGH, g.COUNTY_UNITARY].find((b) => b && BOROUGH_NAMES.has(b));
      // A borough OS names, if it's one of ours; otherwise from the boundaries. Not in one: not London.
      const borough = named ?? this.boroughs.at(lat, lng);
      if (!borough) return [];
      const precision = precisionFor(g.LOCAL_TYPE);
      const district = precision === "road" && g.POSTCODE_DISTRICT ? `, ${g.POSTCODE_DISTRICT}` : "";
      return [
        {
          id: `os-names:${g.ID}`,
          source: "os-names" as const,
          precision,
          label: `${g.NAME1}${district}`,
          postcode: precision === "postcode" ? g.NAME1 : "",
          borough,
          lat,
          lng,
          match: Math.max(0, 1 - i / entries.length),
        },
      ];
    });
  }
}
