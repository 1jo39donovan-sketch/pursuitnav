import { describe, expect, it } from "vitest";

import { hideBaseLabels, isExpressionFilter, withoutClasses } from "../baseLabels";

describe("the base map's own labels where the app draws its own (PM desk test, 19 Nov)", () => {
  it("tells the two kinds of filter apart", () => {
    expect(isExpressionFilter(["all", ["==", "$type", "Point"], ["<=", "rank", 6]])).toBe(false);
    expect(isExpressionFilter(["all", ["==", ["get", "class"], "shop"], ["<=", ["get", "rank"], 6]])).toBe(true);
    expect(isExpressionFilter(["match", ["get", "class"], ["shop"], true, false])).toBe(true);
  });

  it("adds the exclusion in the filter's own form, once", () => {
    const legacy = ["all", ["==", "$type", "Point"], ["<=", "rank", 6]];
    expect(withoutClasses(legacy, ["prison"])).toEqual(["all", legacy, ["!in", "class", "prison"]]);
    const expr = ["<=", ["get", "rank"], 6];
    const once = withoutClasses(expr, ["prison"]);
    expect(once).toEqual(["all", expr, ["match", ["get", "class"], ["prison"], false, true]]);
    expect(withoutClasses(once, ["prison"])).toBe(once);
    expect(withoutClasses(undefined, ["prison"])).toEqual(["!in", "class", "prison"]);
  });

  it("only touches the base map's place labels", () => {
    const style = {
      version: 8,
      sources: {},
      layers: [
        { id: "poi_r1", type: "symbol", source: "openmaptiles", "source-layer": "poi", filter: ["<=", "rank", 6] },
        { id: "road_label", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name" },
      ],
    } as never;
    const [poi, road] = hideBaseLabels(style, ["prison"]).layers as { filter?: unknown }[];
    expect(poi!.filter).toEqual(["all", ["<=", "rank", 6], ["!in", "class", "prison"]]);
    expect(road!.filter).toBeUndefined();
  });
});
