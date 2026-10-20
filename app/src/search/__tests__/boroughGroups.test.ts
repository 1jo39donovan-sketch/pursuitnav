import { describe, expect, it } from "vitest";

import { BOROUGH_GROUPS, LONDON_AREAS } from "../boroughGroups";
import { BOROUGHS } from "../boroughs";

describe("borough groups", () => {
  it("has every borough exactly once", () => {
    const listed = BOROUGH_GROUPS.flatMap((g) => g.boroughs);
    expect([...listed].sort()).toEqual([...BOROUGHS].sort());
  });

  it("covers every borough in at least one of North, South, East, West or Central", () => {
    const covered = new Set(LONDON_AREAS.flatMap((a) => a.boroughs));
    expect([...covered].sort()).toEqual([...BOROUGHS].sort());
  });
});
