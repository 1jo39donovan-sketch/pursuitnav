import { describe, expect, it } from "vitest";

import { BOROUGH_GROUPS } from "../boroughGroups";
import { BOROUGHS } from "../boroughs";

describe("borough groups", () => {
  it("has every borough exactly once", () => {
    const listed = BOROUGH_GROUPS.flatMap((g) => g.boroughs);
    expect([...listed].sort()).toEqual([...BOROUGHS].sort());
  });
});
