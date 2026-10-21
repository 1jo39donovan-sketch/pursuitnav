import type { Address } from "../api/addresses";
import { BOROUGHS, type Borough } from "./boroughs";
import type { AreaFilter, SearchResult, SearchResults } from "./engine";

const MAX_ADDRESSES = 15;

const isBorough = (b: string): b is Borough => (BOROUGHS as readonly string[]).includes(b);

/** Server answers rank door > postcode > road > place, all above the phone's own matches. */
const RANK: Record<NonNullable<Address["precision"]>, number> = { door: 230, postcode: 220, road: 210, place: 200 };

/**
 * The server's addresses go above the offline road matches: they're the more
 * exact answer when the control room gave a full address. Each keeps the
 * precision the server gave it, so a house number found only as its road
 * still gets the "not the door" warning.
 */
export function mergeAddresses(offline: SearchResults, addresses: Address[], area: AreaFilter): SearchResults {
  const results: SearchResult[] = addresses.flatMap((a) => {
    if (!isBorough(a.borough)) return [];
    // Older servers: OS Places only, door level, keyed by UPRN.
    const precision = a.precision ?? "door";
    return [
      {
        key: a.id ?? `uprn:${a.uprn}`,
        label: a.label,
        detail: a.postcode ? `${a.borough} · ${a.postcode}` : a.borough,
        borough: a.borough,
        lat: a.lat,
        lng: a.lng,
        kind: precision === "postcode" ? ("postcode" as const) : ("address" as const),
        precision,
        score: RANK[precision] + a.match,
      },
    ];
  });
  results.sort((a, b) => b.score - a.score);
  const mine = (r: SearchResult) => area.has(r.borough) || (area.near?.(r.lat, r.lng) ?? false);
  const inArea = results.filter(mine).slice(0, MAX_ADDRESSES);
  const outside = results.filter((r) => !mine(r));
  return {
    inArea: [...inArea, ...offline.inArea],
    outside: [...outside, ...offline.outside],
    outsideCount: outside.length + (offline.outsideCount ?? offline.outside.length),
  };
}
