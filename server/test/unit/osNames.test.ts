import { describe, expect, it } from "vitest";

import { BoroughLookup } from "../../src/boroughArea.js";
import { OsNamesClient, precisionFor, type GazetteerEntry } from "../../src/osNames.js";
import { PlacesError } from "../../src/places.js";

const boroughs = BoroughLookup.fromFile();

// Entries in the documented OS Names GAZETTEER_ENTRY shape (British National Grid).
const entry = (over: Partial<GazetteerEntry>): { GAZETTEER_ENTRY: GazetteerEntry } => ({
  GAZETTEER_ENTRY: {
    ID: "osgb4000000074558316",
    NAME1: "Caledonian Road",
    TYPE: "transportNetwork",
    LOCAL_TYPE: "Named_Road",
    GEOMETRY_X: 530596,
    GEOMETRY_Y: 184801,
    POSTCODE_DISTRICT: "N7",
    POPULATED_PLACE: "Islington",
    DISTRICT_BOROUGH: "Islington",
    COUNTY_UNITARY: "Greater London",
    ...over,
  },
});

function fakeFetch(respond: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    return respond(url);
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("OS Names", () => {
  it("maps OS's local types to precisions", () => {
    expect(precisionFor("Postcode")).toBe("postcode");
    for (const t of ["Named_Road", "Section_Of_Named_Road", "Numbered_Road"]) expect(precisionFor(t)).toBe("road");
    for (const t of ["Suburban_Area", "Railway_Station", "Hospital"]) expect(precisionFor(t)).toBe("place");
  });

  it("searches within London, and asks for postcodes only for a full postcode", async () => {
    const f = fakeFetch(() => json({ header: {} }));
    const client = new OsNamesClient("KEY", boroughs, f.impl);
    await client.search("Caledonian Road");
    await client.search("n78la");
    expect(f.calls[0]).toContain("/find?");
    expect(f.calls[0]).toContain("bounds=500000%2C150000%2C565000%2C205000");
    expect(f.calls[0]).not.toContain("fq=");
    expect(f.calls[1]).toContain("query=N7+8LA");
    expect(f.calls[1]).toContain("fq=LOCAL_TYPE%3APostcode");
  });

  it("converts to latitude and longitude, names the borough, and drops places outside London", async () => {
    const f = fakeFetch(() =>
      json({
        results: [
          entry({}),
          entry({ ID: "pc", NAME1: "N7 8LA", LOCAL_TYPE: "Postcode", GEOMETRY_X: 530666, GEOMETRY_Y: 184480 }),
          // No borough field we know: from the boundaries.
          entry({
            ID: "kx",
            NAME1: "King's Cross",
            LOCAL_TYPE: "Suburban_Area",
            GEOMETRY_X: 530240,
            GEOMETRY_Y: 182989,
            DISTRICT_BOROUGH: undefined,
            COUNTY_UNITARY: "Greater London",
          }),
          entry({
            ID: "watford",
            NAME1: "Watford",
            LOCAL_TYPE: "Town",
            GEOMETRY_X: 511447,
            GEOMETRY_Y: 196528,
            DISTRICT_BOROUGH: "Watford",
            COUNTY_UNITARY: "Hertfordshire",
          }),
        ],
      }),
    );
    const out = await new OsNamesClient("KEY", boroughs, f.impl).search("whatever");
    expect(out.map((a) => [a.id, a.precision, a.borough])).toEqual([
      ["os-names:osgb4000000074558316", "road", "Islington"],
      ["os-names:pc", "postcode", "Islington"],
      ["os-names:kx", "place", "Camden"],
    ]);
    expect(out[0]).toMatchObject({ source: "os-names", label: "Caledonian Road, N7", postcode: "" });
    expect(out[0]!.lat).toBeCloseTo(51.547, 3);
    expect(out[0]!.lng).toBeCloseTo(-0.118, 3);
    expect(out[1]).toMatchObject({ label: "N7 8LA", postcode: "N7 8LA" });
  });

  it("treats 400 as no matches, 429 as rate-limited, and anything else as unavailable", async () => {
    const at = (status: number) => new OsNamesClient("SECRET", boroughs, fakeFetch(() => json({}, status)).impl);
    expect(await at(400).search("x")).toEqual([]);
    await expect(at(429).search("x")).rejects.toMatchObject({ status: 429 });
    await expect(at(502).search("x")).rejects.toMatchObject({ status: 503 });
    const down = new OsNamesClient(
      "SECRET",
      boroughs,
      fakeFetch(() => Promise.reject(new TypeError("fetch failed"))).impl,
    );
    await expect(down.search("x")).rejects.toMatchObject({ status: 503 });
  });

  it("gives up after its timeout", async () => {
    // The client passes an abort signal; a fetch that honours it rejects.
    const impl = ((url: string, init: { signal: AbortSignal }) =>
      new Promise((_, reject) =>
        init.signal.addEventListener("abort", () => reject(init.signal.reason)),
      )) as unknown as typeof fetch;
    const client = new OsNamesClient("SECRET", boroughs, impl, undefined, 20);
    await expect(client.search("x")).rejects.toMatchObject({ status: 503 });
  });

  it("never puts the key in an error", async () => {
    for (const status of [401, 429, 500]) {
      const err = await new OsNamesClient("SECRET-KEY", boroughs, fakeFetch(() => json({}, status)).impl)
        .search("x")
        .catch((e: PlacesError) => e);
      expect(String((err as Error).message)).not.toContain("SECRET-KEY");
    }
    const err = await new OsNamesClient(
      "SECRET-KEY",
      boroughs,
      fakeFetch(() => Promise.reject(new TypeError("x"))).impl,
    )
      .search("x")
      .catch((e: Error) => e);
    expect((err as Error).message).not.toContain("SECRET-KEY");
  });
});
