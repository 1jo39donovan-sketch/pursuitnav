import { describe, expect, it } from "vitest";

import type { RoutePlan } from "../../api/routes";
import type { SearchResult } from "../../search/engine";
import { prefetchKey, prefetchTarget, usable, type Prefetch } from "../prefetch";

const result = (label: string) => ({ label, lat: 51.55, lng: -0.12 }) as SearchResult;
const plan = Promise.resolve({} as RoutePlan);

describe("route prefetch", () => {
  it("guesses the top match only when there are few in the area", () => {
    expect(prefetchTarget({ inArea: [], outside: [result("x")] })).toBeNull();
    expect(prefetchTarget({ inArea: [result("54 Caledonian Road")], outside: [] })?.label).toBe("54 Caledonian Road");
    expect(prefetchTarget({ inArea: [result("a"), result("b"), result("c")], outside: [] })?.label).toBe("a");
    expect(prefetchTarget({ inArea: [result("a"), result("b"), result("c"), result("d")], outside: [] })).toBeNull();
  });

  it("uses a prefetch only for the same plan, from about here, soon after", () => {
    const key = prefetchKey({ lat: 51.55, lng: -0.12 }, "car", "main", true);
    const from = { lat: 51.5, lng: -0.1 };
    const p: Prefetch = { key, origin: { madeAt: 0, from }, quick: plan, full: null, controller: new AbortController(), failed: false };
    expect(usable(p, key, from, 5_000)).toBe(true);
    // Another vehicle or blue light off: a different route.
    expect(usable(p, prefetchKey({ lat: 51.55, lng: -0.12 }, "van", "main", true), from, 5_000)).toBe(false);
    expect(usable(p, prefetchKey({ lat: 51.55, lng: -0.12 }, "car", "main", false), from, 5_000)).toBe(false);
    // Too old, or the phone has moved on.
    expect(usable(p, key, from, 60_000)).toBe(false);
    expect(usable(p, key, { lat: 51.51, lng: -0.1 }, 5_000)).toBe(false);
    expect(usable({ ...p, failed: true }, key, from, 5_000)).toBe(false);
    expect(usable(null, key, from, 5_000)).toBe(false);
  });
});
