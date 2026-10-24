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

/** "Flat 3, 53 Caledonian Road" → "caledonian road": the road a door is on. */
const doorRoad = (label: string) => roadName(label.split(",").at(-1)!.trim().replace(/^\d+[a-z]?\s+/i, ""));

const compact = (postcode: string) => postcode.replace(/\s/g, "").toUpperCase();

/**
 * The server's doors and postcodes go above the phone's own matches: they're
 * the more exact answer when the control room gave a full address. Its roads
 * and places go below them, and a road the phone already lists in that
 * borough isn't shown twice. Each keeps the precision the server gave it, so
 * a house number found only as its road still says ROAD.
 */
export function mergeAddresses(offline: SearchResults, addresses: Address[], area: AreaFilter): SearchResults {
  const listed = new Set(
    [...offline.inArea, ...offline.outside].flatMap((r) => (r.road ? [`${roadName(r.road)}|${r.borough}`] : [])),
  );
  // The same thing twice from the server (a road in sections, say) is shown once.
  const shown = new Set<string>();
  const results: SearchResult[] = addresses.flatMap((a) => {
    if (!isBorough(a.borough)) return [];
    // Older servers: OS Places only, door level, keyed by UPRN.
    const precision = a.precision ?? "door";
    // A road the phone already lists, under any label the server gives it.
    if ((precision === "road" || precision === "place") && listed.has(`${roadName(a.label)}|${a.borough}`)) return [];
    const same = `${precision}|${a.label.toLowerCase()}|${a.borough}`;
    if (shown.has(same)) return [];
    shown.add(same);
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
  // The phone's own rows the server has said better: a postcode it also
  // found, or a road it found the door on.
  const postcodes = new Set(results.filter((r) => r.precision === "postcode").map((r) => compact(r.label)));
  const doors = new Set(results.filter((r) => r.precision === "door").map((r) => `${doorRoad(r.label)}|${r.borough}`));
  const better = (r: SearchResult) =>
    (r.kind === "postcode" && postcodes.has(compact(r.label))) ||
    (r.precision === "road" && !!r.road && doors.has(`${roadName(r.road)}|${r.borough}`));
  const phoneIn = offline.inArea.filter((r) => !better(r));
  const phoneOut = offline.outside.filter((r) => !better(r));
  return {
    inArea: [...inArea.filter(exact), ...phoneIn, ...inArea.filter((r) => !exact(r))],
    outside: [...outside.filter(exact), ...phoneOut, ...outside.filter((r) => !exact(r))],
    outsideCount:
      outside.length + (offline.outsideCount ?? offline.outside.length) - (offline.outside.length - phoneOut.length),
  };
}
