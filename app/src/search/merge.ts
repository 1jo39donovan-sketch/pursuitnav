import type { Address } from "../api/addresses";
import { BOROUGHS, type Borough } from "./boroughs";
import type { AreaFilter, SearchResult, SearchResults } from "./engine";

const MAX_ADDRESSES = 15;

const isBorough = (b: string): b is Borough => (BOROUGHS as readonly string[]).includes(b);

/** Server answers rank door > postcode > road > place. */
const RANK: Record<NonNullable<Address["precision"]>, number> = { door: 230, postcode: 220, road: 210, place: 200 };

const KIND = {
  door: "address",
  postcode: "postcode",
  road: "road",
  place: "poi",
} as const satisfies Record<NonNullable<Address["precision"]>, SearchResult["kind"]>;

/** "Caledonian Road, N7" → "caledonian road", for spotting a road the phone already lists. */
const roadName = (label: string) => label.split(",")[0]!.trim().toLowerCase();

/**
 * The server's doors and postcodes go above the phone's own matches: they're
 * the more exact answer when the control room gave a full address. Its roads
 * and places go below them, and a road the phone already lists in that
 * borough isn't shown twice. Each keeps the precision the server gave it, so
 * a house number found only as its road still gets the "not the door" warning.
 */
export function mergeAddresses(offline: SearchResults, addresses: Address[], area: AreaFilter): SearchResults {
  const listed = new Set(
    [...offline.inArea, ...offline.outside].flatMap((r) => (r.road ? [`${roadName(r.road)}|${r.borough}`] : [])),
  );
  const results: SearchResult[] = addresses.flatMap((a) => {
    if (!isBorough(a.borough)) return [];
    // Older servers: OS Places only, door level, keyed by UPRN.
    const precision = a.precision ?? "door";
    if (precision === "road" && listed.has(`${roadName(a.label)}|${a.borough}`)) return [];
    return [
      {
        key: a.id ?? `uprn:${a.uprn}`,
        label: a.label,
        detail: a.postcode ? `${a.borough} · ${a.postcode}` : a.borough,
        borough: a.borough,
        lat: a.lat,
        lng: a.lng,
        kind: KIND[precision],
        precision,
        score: RANK[precision] + a.match,
        ...(precision === "road" ? { road: a.label.split(",")[0]!.trim() } : {}),
        ...(precision === "place" ? { placeType: "Place" } : {}),
      },
    ];
  });
  results.sort((a, b) => b.score - a.score);
  const exact = (r: SearchResult) => r.precision === "door" || r.precision === "postcode";
  const mine = (r: SearchResult) => area.has(r.borough) || (area.near?.(r.lat, r.lng) ?? false);
  const inArea = results.filter(mine).slice(0, MAX_ADDRESSES);
  const outside = results.filter((r) => !mine(r));
  return {
    inArea: [...inArea.filter(exact), ...offline.inArea, ...inArea.filter((r) => !exact(r))],
    outside: [...outside.filter(exact), ...offline.outside, ...outside.filter((r) => !exact(r))],
    outsideCount: outside.length + (offline.outsideCount ?? offline.outside.length),
  };
}
