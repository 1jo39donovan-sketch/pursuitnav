import { describe, expect, it } from "vitest";

import { BoroughLookup } from "../../src/boroughArea.js";

describe("BoroughLookup", () => {
  const areas = BoroughLookup.fromFile();

  it("finds London boroughs and, for the Kent pilot, Kent's districts and Medway", () => {
    expect(areas.at(51.5466, -0.1035)).toBe("Islington");
    expect(areas.at(51.2798, 1.0828)).toBe("Canterbury");
    expect(areas.at(51.3887, 0.5054)).toBe("Medway");
  });

  it("finds nothing outside them", () => {
    expect(areas.at(51.0, 0.27)).toBeNull(); // East Sussex
    expect(areas.at(51.656, -0.396)).toBeNull(); // Watford
  });
});
