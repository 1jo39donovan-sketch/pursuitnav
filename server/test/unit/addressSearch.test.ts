import { describe, expect, it } from "vitest";

import {
  AddressSearch,
  CACHE_TTL_MS,
  EMPTY_TTL_MS,
  MAX_RESULTS,
  mergeResults,
  normaliseQuery,
  QueryCache,
  type Provider,
} from "../../src/addressSearch.js";
import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import { PlacesError, type Address, type AddressSource } from "../../src/places.js";
import type { Router } from "../../src/valhalla.js";

const addr = (over: Partial<Address>): Address => ({
  id: "osm:N1",
  source: "osm",
  precision: "door",
  label: "53 Caledonian Road",
  postcode: "",
  borough: "Islington",
  lat: 51.5441,
  lng: -0.1171,
  match: 0.5,
  ...over,
});

/** A provider that answers from a list (or fails), counting its calls. */
function provider(source: AddressSource, answer: Address[] | PlacesError, cacheable = source !== "os-places") {
  const p = {
    calls: 0,
    source,
    cacheable,
    client: {
      search: async () => {
        p.calls++;
        if (answer instanceof PlacesError) throw answer;
        return answer;
      },
    },
  };
  return p satisfies Provider & { calls: number };
}

describe("merging providers' answers", () => {
  it("puts doors first, then postcodes, roads and places", () => {
    const out = mergeResults([
      [
        addr({ id: "p", precision: "place", label: "King's Cross" }),
        addr({ id: "r", precision: "road", label: "Caledonian Road" }),
      ],
      [addr({ id: "pc", precision: "postcode", label: "N7 8LA", postcode: "N7 8LA" }), addr({ id: "d" })],
    ]);
    expect(out.map((a) => a.id)).toEqual(["d", "pc", "r", "p"]);
  });

  it("shows the same address once within 30 m, preferring OS Places, then OSM, then OS Names", () => {
    const out = mergeResults([
      [addr({ id: "os-names:1", source: "os-names", precision: "road", label: "Caledonian Road, N7" })],
      [addr({ id: "osm:W1", precision: "road", label: "Caledonian Road", lat: 51.5442 })], // ~11 m away
      [addr({ id: "osm:N1" })],
      [addr({ id: "os-places:1", source: "os-places", label: "53 Caledonian Road", lat: 51.5443 })], // ~22 m
    ]);
    expect(out.map((a) => a.id)).toEqual(["os-places:1", "osm:W1"]);
  });

  it("shows a road's sections once, but keeps roads of one name in other boroughs or districts", () => {
    const section = (id: string, label: string, borough = "Islington", lat = 51.5441) =>
      addr({ id, source: "os-names", precision: "road", label, borough, lat });
    const out = mergeResults([
      [
        section("a", "Caledonian Road, N7"),
        section("b", "Caledonian Road, N7", "Islington", 51.55), // another section, ~650 m north
        section("c", "Caledonian Road, N1", "Islington", 51.535),
        section("d", "Caledonian Road, N7", "Camden", 51.56),
      ],
    ]);
    expect(out.map((a) => a.id)).toEqual(["a", "c", "d"]);
  });

  it("keeps doors with the same label further apart than 30 m (two streets of one name)", () => {
    const out = mergeResults([[addr({ id: "a" }), addr({ id: "b", lat: 51.55 })]]);
    expect(out).toHaveLength(2);
  });

  it("returns at most 30", () => {
    const many = Array.from({ length: 50 }, (_, i) => addr({ id: `n${i}`, label: `${i} Caledonian Road` }));
    expect(mergeResults([many])).toHaveLength(MAX_RESULTS);
  });
});

describe("AddressSearch", () => {
  it("asks every provider and merges the answers", async () => {
    const names = provider("os-names", [
      addr({ id: "os-names:1", source: "os-names", precision: "road", label: "Caledonian Road, N7" }),
    ]);
    const osm = provider("osm", [addr({})]);
    const out = await new AddressSearch([names, osm]).search("53 Caledonian Road");
    expect(out.map((a) => a.id)).toEqual(["osm:N1", "os-names:1"]);
  });

  it("carries on when one provider fails, and fails only when all do", async () => {
    const limited = provider("os-names", new PlacesError("OS Names returned 429", 429));
    const osm = provider("osm", [addr({})]);
    expect(await new AddressSearch([limited, osm]).search("53 Caledonian Road")).toHaveLength(1);
    const down = provider("osm", new PlacesError("down", 503));
    await expect(new AddressSearch([limited, down]).search("x")).rejects.toMatchObject({ status: 503 });
    await expect(new AddressSearch([limited]).search("x")).rejects.toMatchObject({ status: 429 });
  });

  it("asks OS Places only when it's configured, and never caches its answers", async () => {
    const places = provider("os-places", [addr({ id: "os-places:1", source: "os-places" })]);
    const osm = provider("osm", [addr({})]);
    const search = new AddressSearch([osm, places]);
    expect(search.has("os-places")).toBe(true);
    expect(new AddressSearch([osm]).has("os-places")).toBe(false);
    await search.search("53 Caledonian Road");
    const again = await search.search("53 Caledonian Road");
    expect(osm.calls).toBe(1); // from the cache
    expect(places.calls).toBe(2); // asked each time
    expect(again.map((a) => a.id)).toEqual(["os-places:1"]); // the same door, once
  });

  it("asks OS for a full postcode, and OpenStreetMap only if OS has nothing", async () => {
    const pc = addr({
      id: "os-names:pc",
      source: "os-names",
      precision: "postcode",
      label: "N7 8LA",
      postcode: "N7 8LA",
    });
    const names = provider("os-names", [pc]);
    const osm = provider("osm", [addr({ id: "osm:pc", precision: "postcode", label: "N7 8LA", postcode: "N7 8LA" })]);
    expect((await new AddressSearch([names, osm]).search("N7 8LA")).map((a) => a.id)).toEqual(["os-names:pc"]);
    expect(osm.calls).toBe(0);
    const empty = provider("os-names", []);
    expect((await new AddressSearch([empty, osm]).search("n78la")).map((a) => a.id)).toEqual(["osm:pc"]);
    const failing = provider("os-names", new PlacesError("down", 503));
    expect((await new AddressSearch([failing, osm]).search("N7 8LA")).map((a) => a.id)).toEqual(["osm:pc"]);
  });

  it("answers a repeat search from the cache, with no outbound call", async () => {
    const names = provider("os-names", []);
    const osm = provider("osm", [addr({})]);
    const search = new AddressSearch([names, osm]);
    await search.search("53 Caledonian Road");
    await search.search("  53   caledonian ROAD ");
    expect([names.calls, osm.calls]).toEqual([1, 1]);
  });

  it("doesn't cache a failure, or an answer with a provider missing", async () => {
    const names = provider("os-names", new PlacesError("down", 503));
    const osm = provider("osm", [addr({})]);
    const search = new AddressSearch([names, osm]);
    await search.search("53 Caledonian Road");
    await search.search("53 Caledonian Road");
    expect(osm.calls).toBe(2);
  });
});

describe("QueryCache", () => {
  const clock = () => {
    let t = 0;
    return { now: () => t, add: (ms: number) => (t += ms) };
  };

  it("keeps answers for 24 hours, and empty ones for 10 minutes", () => {
    const c = clock();
    const cache = new QueryCache<number[]>(10, c.now);
    cache.set("full", [1], CACHE_TTL_MS);
    cache.set("empty", [], EMPTY_TTL_MS);
    c.add(EMPTY_TTL_MS - 1);
    expect(cache.get("empty")).toEqual([]);
    c.add(1);
    expect(cache.get("empty")).toBeUndefined();
    c.add(CACHE_TTL_MS - EMPTY_TTL_MS - 1);
    expect(cache.get("full")).toEqual([1]);
    c.add(1);
    expect(cache.get("full")).toBeUndefined();
  });

  it("drops the least recently used entry when full", () => {
    const cache = new QueryCache<number>(2);
    cache.set("a", 1, CACHE_TTL_MS);
    cache.set("b", 2, CACHE_TTL_MS);
    cache.get("a"); // a used more recently than b
    cache.set("c", 3, CACHE_TTL_MS);
    expect([cache.get("a"), cache.get("b"), cache.get("c")]).toEqual([1, undefined, 3]);
    expect(cache.size).toBe(2);
  });

  it("normalises queries: case, spaces, and spaces in postcodes", () => {
    expect(normaliseQuery("  54  Caledonian ROAD, N7 8LA ")).toBe("54 caledonian road, n78la");
    expect(normaliseQuery("n7 8la")).toBe(normaliseQuery("N78LA"));
  });
});

describe("POST /v1/addresses with providers", () => {
  const config = { bounds: [-0.8, 51.2, 0.6, 51.8] } as ServerConfig;

  it("answers 200 with Nominatim's results while OS Names is rate-limited", async () => {
    const search = new AddressSearch([provider("os-names", new PlacesError("429", 429)), provider("osm", [addr({})])]);
    const res = await buildApp(config, {} as Router, search).inject({
      method: "POST",
      url: "/v1/addresses",
      payload: { query: "53 Caledonian Road" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().addresses[0]).toMatchObject({ id: "osm:N1", precision: "door", borough: "Islington" });
    // Older apps key their result rows by uprn: each row gets its own.
    expect(res.json().addresses[0].uprn).toBe("osm:N1");
  });

  it("answers 503 addresses-unavailable when every provider fails", async () => {
    const search = new AddressSearch([provider("osm", new PlacesError("down", 503))]);
    const res = await buildApp(config, {} as Router, search).inject({
      method: "POST",
      url: "/v1/addresses",
      payload: { query: "53 Caledonian Road" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("addresses-unavailable");
  });
});
