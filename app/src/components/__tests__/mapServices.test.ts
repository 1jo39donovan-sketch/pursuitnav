import { describe, expect, it } from "vitest";

import { CUSTODY_SUITES } from "../../area/custody";
import type { PointOfInterest } from "../../search/places";
import { SERVICES_SOURCE, servicePoints, withServices } from "../mapServices";

const poi = (name: string, type: string, borough: string, lng = -0.1, lat = 51.55): PointOfInterest =>
  ({ name, type, borough, lat, lng, group: "emergency", otherNames: [], address: "" }) as PointOfInterest;

describe("services on the map", () => {
  const suite = CUSTODY_SUITES.find((c) => c.kind === "24/7")!;
  const pois = [
    poi(`${suite.match} Police Station`, "Police station", suite.borough),
    poi("Holloway Police Station", "Police station", "Islington"),
    poi("Islington Fire Station", "Fire station", "Islington"),
    poi("Royal Free Hospital", "Hospital with A&E", "Camden"),
    poi("Coffee Corner", "Coffee shop", "Islington"),
  ];

  it("marks police (custody suites as C), fire and A&E, and nothing else", () => {
    const f = servicePoints(pois).features.map((x) => [x.properties!.name, x.properties!.kind, x.properties!.letter]);
    expect(f).toEqual([
      [`${suite.match} Police Station`, "custody", "C"],
      ["Holloway Police Station", "police", "P"],
      ["Islington Fire Station", "fire", "F"],
      ["Royal Free Hospital", "ae", "A&E"],
    ]);
  });

  it("counts a hospital with an A&E entrance beside it as A&E (the Whittington)", () => {
    const hospital = poi("The Whittington Hospital", "Hospital", "Islington", -0.1383, 51.5658);
    const entrance = poi("A&E entrance", "A&E entrance", "Islington", -0.1378, 51.5662);
    const faraway = poi("A Clinic Hospital", "Hospital", "Islington", -0.10, 51.53);
    const f = servicePoints([hospital, entrance, faraway]).features.map((x) => [x.properties!.name, x.properties!.kind]);
    expect(f).toEqual([["The Whittington Hospital", "ae"]]);
  });

  it("says who runs it and about custody, for the card a tap opens", () => {
    const btp = poi("British Transport Police", "Police station", "Camden");
    const brewery = poi("Brewery Road BTP Police Station", "Police station", "Islington");
    const fire = poi("Margate Fire Station", "Fire station", "Thanet");
    const [a, b, c] = servicePoints([btp, brewery, fire]).features.map((f) => f.properties!);
    expect(a).toMatchObject({ type: "BTP station", borough: "Camden" });
    expect(a.notes).toContain("British Transport Police");
    expect(a.notes).toContain("No custody suite here.");
    // Brewery Lane is BTP's 24/7 suite (London's list).
    expect(b.type).toBe("BTP station · custody");
    expect(b.notes).toContain("24/7 custody suite (British Transport Police)");
    expect(c).toMatchObject({ type: "Fire station" });
    expect(c.notes).toBe("Kent Fire and Rescue Service");
  });

  it("leaves out what isn't police, and marks bases with no counter", () => {
    const f = servicePoints([
      poi("Former smallest police station of England", "Police station", "Westminster"),
      poi("National Crime Agency", "Police station", "Lambeth"),
      poi("Quicksilver Patrol Base", "Police station", "Haringey"),
    ]).features.map((x) => x.properties!);
    expect(f.map((x) => x.name)).toEqual(["Quicksilver Patrol Base"]);
    expect(f[0]).toMatchObject({ type: "Police base" });
    expect(f[0]!.notes).toContain("no public front counter");
  });

  it("draws them on top in the style's font, and replaces rather than stacks", () => {
    const style = {
      version: 8,
      sources: {},
      layers: [{ id: "label", type: "symbol", source: "x", layout: { "text-font": ["Noto Sans Regular"] } }],
    } as never;
    const once = withServices(style, "night", servicePoints(pois));
    expect(once.sources[SERVICES_SOURCE]).toBeDefined();
    const ids = once.layers.map((l) => l.id);
    expect(ids[0]).toBe("label");
    expect((once.layers.at(-1)!.layout as Record<string, unknown>)["text-font"]).toEqual(["Noto Sans Bold"]);
    expect(withServices(once, "night", servicePoints(pois)).layers.map((l) => l.id)).toEqual(ids);
    expect(withServices(once, "night", null).layers.map((l) => l.id)).toEqual(["label"]);
  });
});
