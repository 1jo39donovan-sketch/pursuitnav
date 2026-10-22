// One address search over every provider this server has: OS Names
// (postcodes, roads, places; free), OpenStreetMap through our own Nominatim
// (house numbers; free) and, only if a key is set, OS Places (paid; flats and
// named buildings). Asked in parallel and merged: doors first, then
// postcodes, roads and places; the same address from two providers shown
// once. One provider failing doesn't fail the search.
//
// Answers are kept in memory for a day so a repeat search is instant and
// costs no outbound call. Only in memory: never written to disk or logged.
import { distanceM } from "./geo.js";
import { normaliseStreet } from "./nominatim.js";
import {
  FULL_POSTCODE,
  PlacesError,
  type Address,
  type AddressPrecision,
  type AddressSource,
  type AddressStatus,
  type PlacesClient,
} from "./places.js";

export const MAX_RESULTS = 30;
/** Within this, two results for the same address or road are one. */
export const SAME_PLACE_M = 30;
export const CACHE_TTL_MS = 24 * 3600_000;
export const EMPTY_TTL_MS = 10 * 60_000;
export const CACHE_ENTRIES = 5000;

export interface Provider {
  source: AddressSource;
  client: PlacesClient;
  /**
   * Whether its answers may be kept in the cache. OS Places' licence on
   * keeping results isn't clear for this use, so its answers never are.
   */
  cacheable: boolean;
}

const PRECISION_ORDER: Record<AddressPrecision, number> = { door: 0, postcode: 1, road: 2, place: 3 };
/** Which provider's copy to keep when two have the same address. */
const SOURCE_ORDER: Record<AddressSource, number> = { "os-places": 0, osm: 1, "os-names": 2 };

/** "54  Caledonian Rd, n7 8la" → "54 caledonian rd, n78la". */
export function normaliseQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z]{1,2}\d[a-z\d]?) (\d[a-z]{2})\b/g, "$1$2");
}

/** A small least-recently-used cache with a time limit per entry. */
export class QueryCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();

  constructor(
    private readonly max = CACHE_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    this.entries.delete(key);
    if (hit.expires <= this.now()) return undefined;
    this.entries.set(key, hit); // most recently used last
    return hit.value;
  }

  set(key: string, value: T, ttlMs: number) {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + ttlMs });
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!);
  }

  get size() {
    return this.entries.size;
  }
}

function sameKey(a: Address): string {
  if (a.precision === "postcode") return a.postcode.replace(/\s/g, "").toUpperCase() || normaliseStreet(a.label);
  // Roads: OS Names adds the postcode district ("Caledonian Road, N7"); compare the name.
  return normaliseStreet(a.precision === "door" ? a.label : a.label.split(",")[0]!);
}

/**
 * Doors first, then postcodes, roads and places; duplicates within 30 m
 * dropped, and a road's sections shown once; at most 30.
 */
export function mergeResults(lists: Address[][]): Address[] {
  const all = lists
    .flat()
    .sort(
      (a, b) =>
        PRECISION_ORDER[a.precision] - PRECISION_ORDER[b.precision] ||
        SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] ||
        b.match - a.match,
    );
  const kept: Address[] = [];
  for (const a of all) {
    const key = sameKey(a);
    const dup = kept.some(
      (k) =>
        k.precision === a.precision &&
        sameKey(k) === key &&
        (distanceM([k.lng, k.lat], [a.lng, a.lat]) <= SAME_PLACE_M ||
          // OS Names lists a long road once per section: the same name in the
          // same borough and postcode district is one road to the operator.
          (a.precision === "road" && k.borough === a.borough && k.label === a.label)),
    );
    if (!dup) kept.push(a);
    if (kept.length === MAX_RESULTS) break;
  }
  return kept;
}

export class AddressSearch implements PlacesClient {
  constructor(
    readonly providers: Provider[],
    private readonly cache = new QueryCache<Address[]>(),
  ) {}

  has(source: AddressSource): boolean {
    return this.providers.some((p) => p.source === source);
  }

  async status(): Promise<AddressStatus> {
    const osm = this.providers.find((p) => p.source === "osm")?.client as
      | { ready?: () => Promise<boolean> }
      | undefined;
    return {
      osNames: this.has("os-names"),
      nominatim: osm?.ready ? await osm.ready() : false,
      osPlaces: this.has("os-places"),
    };
  }

  async search(query: string): Promise<Address[]> {
    const postcode = FULL_POSTCODE.test(query.replace(/\s/g, "").toUpperCase());
    // A full postcode: OS knows every one. OpenStreetMap is asked only if OS has nothing.
    const first = postcode ? this.providers.filter((p) => p.source !== "osm") : this.providers;
    let lists: Address[][] = [];
    let failed: unknown;
    try {
      lists = await this.ask(first, query);
    } catch (err) {
      failed = err;
    }
    const osm = this.providers.filter((p) => p.source === "osm");
    if (postcode && osm.length && lists.flat().length === 0) {
      try {
        lists = [...lists, ...(await this.ask(osm, query))];
        failed = undefined;
      } catch (err) {
        failed ??= err;
      }
    }
    if (failed) throw failed;
    return mergeResults(lists);
  }

  /** Each provider's answer, from the cache where allowed. Throws only if every provider failed. */
  private async ask(providers: Provider[], query: string): Promise<Address[][]> {
    if (!providers.length) return [];
    const normalised = normaliseQuery(query);
    const cacheable = providers.filter((p) => p.cacheable);
    const cacheKey = `${cacheable.map((p) => p.source).join("+")}|${normalised}`;
    const cached = cacheable.length ? this.cache.get(cacheKey) : undefined;
    const live = cached ? providers.filter((p) => !p.cacheable) : providers;

    const settled = await Promise.allSettled(live.map((p) => p.client.search(query)));
    const ok = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
    const failures = settled.flatMap((s) => (s.status === "rejected" ? [s.reason as unknown] : []));
    if (!cached && ok.length === 0 && failures.length) {
      const allLimited = failures.every((f) => f instanceof PlacesError && f.status === 429);
      throw new PlacesError("Every address provider failed", allLimited ? 429 : 503);
    }

    if (!cached && cacheable.length) {
      // Only a complete answer is kept: one with a provider missing would hide it for a day.
      const cacheableFailed = settled.some((s, i) => s.status === "rejected" && live[i]!.cacheable);
      if (!cacheableFailed) {
        const value = settled.flatMap((s, i) => (s.status === "fulfilled" && live[i]!.cacheable ? s.value : []));
        this.cache.set(cacheKey, value, value.length ? CACHE_TTL_MS : EMPTY_TTL_MS);
      }
    }
    if (!cached) return ok;
    const uncached = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
    return [cached, ...uncached];
  }
}
