import type { Address } from "../api/addresses";
import { BOROUGHS, type Borough } from "./boroughs";
import type { SearchResult, SearchResults } from "./engine";

const MAX_ADDRESSES = 15;

const isBorough = (b: string): b is Borough => (BOROUGHS as readonly string[]).includes(b);

/**
 * Door-level addresses from OS Places go above the offline road matches:
 * they're the more exact answer when the control room gave a full address.
 */
export function mergeAddresses(offline: SearchResults, addresses: Address[], area: ReadonlySet<Borough>): SearchResults {
  const results: SearchResult[] = addresses.flatMap((a) =>
    isBorough(a.borough)
      ? [
          {
            key: `uprn:${a.uprn}`,
            label: a.label,
            detail: `${a.borough} · ${a.postcode}`,
            borough: a.borough,
            lat: a.lat,
            lng: a.lng,
            kind: "address" as const,
            precision: "door" as const,
            score: 200 + a.match,
          },
        ]
      : [],
  );
  const inArea = results.filter((r) => area.has(r.borough)).slice(0, MAX_ADDRESSES);
  const outside = results.filter((r) => !area.has(r.borough));
  return {
    inArea: [...inArea, ...offline.inArea],
    outside: [...outside, ...offline.outside],
    outsideCount: outside.length + (offline.outsideCount ?? offline.outside.length),
  };
}
