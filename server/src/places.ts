// Door-level address search through the OS Places API. The key stays on the
// server; results are passed straight through and never stored or logged.
import { LONDON_CUSTODIANS } from "./boroughs.js";

export interface Address {
  uprn: string;
  /** "Flat 3, 54 Caledonian Road". */
  label: string;
  postcode: string;
  borough: string;
  lat: number;
  lng: number;
  /** OS match score, 0–1. */
  match: number;
}

/** The fields of an OS Places DPA record we use (output_srs=EPSG:4326). */
interface DpaRecord {
  UPRN: string;
  SUB_BUILDING_NAME?: string;
  BUILDING_NAME?: string;
  BUILDING_NUMBER?: string;
  DEPENDENT_THOROUGHFARE_NAME?: string;
  THOROUGHFARE_NAME?: string;
  DOUBLE_DEPENDENT_LOCALITY?: string;
  DEPENDENT_LOCALITY?: string;
  POST_TOWN?: string;
  POSTCODE: string;
  LOCAL_CUSTODIAN_CODE: number;
  LAT: number;
  LNG: number;
  MATCH?: number;
}

interface PlacesResponse {
  results?: Array<{ DPA?: DpaRecord }>;
}

export class PlacesError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;

/** "CALEDONIAN ROAD" → "Caledonian Road"; keeps "3A" and "N7" as they are. */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])([a-z']*)/g, (_, first: string, rest: string) => first.toUpperCase() + rest);
}

export function labelFor(r: DpaRecord): string {
  const street = r.DEPENDENT_THOROUGHFARE_NAME ?? r.THOROUGHFARE_NAME;
  const parts = [
    r.SUB_BUILDING_NAME,
    r.BUILDING_NAME,
    street ? [r.BUILDING_NUMBER, street].filter(Boolean).join(" ") : r.BUILDING_NUMBER,
  ].filter((p): p is string => !!p);
  return titleCase(parts.join(", "));
}

export interface PlacesClient {
  search(query: string): Promise<Address[]>;
}

export class OsPlacesClient implements PlacesClient {
  constructor(
    private readonly key: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = "https://api.os.uk/search/places/v1",
  ) {}

  async search(query: string): Promise<Address[]> {
    const compact = query.replace(/\s/g, "").toUpperCase();
    const params = new URLSearchParams({ output_srs: "EPSG:4326", maxresults: "100", key: this.key });
    let url: string;
    if (FULL_POSTCODE.test(compact)) {
      params.set("postcode", compact);
      url = `${this.baseUrl}/postcode?${params}`;
    } else {
      params.set("query", query);
      url = `${this.baseUrl}/find?${params}`;
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new PlacesError("OS Places unreachable", 503);
    }
    // OS returns 400 for queries it can't parse; treat as no matches.
    if (res.status === 400) return [];
    if (!res.ok) throw new PlacesError(`OS Places returned ${res.status}`, res.status === 429 ? 429 : 503);
    const data = (await res.json()) as PlacesResponse;

    return (data.results ?? []).flatMap(({ DPA: r }) => {
      const borough = r && LONDON_CUSTODIANS[Number(r.LOCAL_CUSTODIAN_CODE)];
      if (!r || !borough || typeof r.LAT !== "number" || typeof r.LNG !== "number") return [];
      return [
        {
          uprn: String(r.UPRN),
          label: labelFor(r),
          postcode: r.POSTCODE,
          borough,
          lat: r.LAT,
          lng: r.LNG,
          match: r.MATCH ?? 1,
        },
      ];
    });
  }
}
