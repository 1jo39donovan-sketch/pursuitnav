import { describe, expect, it } from "vitest";

import { BOROUGH_GROUPS, KENT_GROUPS, LONDON_AREAS, areaSummary } from "../boroughGroups";
import { BOROUGHS, KENT_DISTRICTS, LONDON_BOROUGHS } from "../boroughs";

describe("borough groups", () => {
  it("has every London borough exactly once", () => {
    const listed = BOROUGH_GROUPS.flatMap((g) => g.boroughs);
    expect([...listed].sort()).toEqual([...LONDON_BOROUGHS].sort());
  });

  it("covers every London borough in at least one of North, South, East, West or Central", () => {
    const covered = new Set(LONDON_AREAS.flatMap((a) => a.boroughs));
    expect([...covered].sort()).toEqual([...LONDON_BOROUGHS].sort());
  });

  it("has every Kent district in exactly one of North, East or West Kent", () => {
    const listed = KENT_GROUPS.flatMap((g) => g.boroughs);
    expect([...listed].sort()).toEqual([...KENT_DISTRICTS].sort());
  });

  it("keeps London's areas first, in the order the data files number them", () => {
    expect(BOROUGHS.slice(0, 33)).toEqual([...LONDON_BOROUGHS]);
    expect(BOROUGHS[0]).toBe("Barking and Dagenham");
    expect(BOROUGHS[32]).toBe("Westminster");
    expect(BOROUGHS[33]).toBe("Ashford");
  });
});

describe("areaSummary", () => {
  it("names whole regions", () => {
    expect(areaSummary([...LONDON_BOROUGHS])).toBe("All London");
    expect(areaSummary([...KENT_DISTRICTS])).toBe("All Kent");
    expect(areaSummary([...BOROUGHS])).toBe("All London and Kent");
  });

  it("names big areas, with the region's word for its areas", () => {
    expect(areaSummary(["Ashford", "Canterbury", "Dover", "Folkestone and Hythe", "Thanet"])).toBe("East Kent (5 districts)");
    expect(areaSummary(LONDON_AREAS.find((a) => a.name === "North")!.boroughs)).toBe("North London (9 boroughs)");
  });

  it("lists anything else by name, shortened for the header", () => {
    expect(areaSummary(["Islington", "Medway"])).toBe("Islington · Medway");
    expect(areaSummary(["Islington", "Camden", "Medway"], true)).toBe("Islington +2");
    expect(areaSummary([], true)).toBe("No area");
  });
});
