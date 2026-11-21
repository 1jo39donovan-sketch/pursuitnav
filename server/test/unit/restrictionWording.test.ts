import { describe, expect, it } from "vitest";

import { roadName, turnDescription } from "../../src/restrictions.js";

describe("how a restriction reads to the operator (21 Nov)", () => {
  it("a turn from a road back onto itself is 'on' that road, not 'into' it", () => {
    expect(turnDescription("Bethnal Green Road", "Bethnal Green Road", 95)).toBe("No right turn on Bethnal Green Road");
    expect(turnDescription("Bethnal Green Road", "Bethnal Green Road", 170)).toBe("No U-turn on Bethnal Green Road");
  });

  it("a turn into another road names both", () => {
    expect(turnDescription("Bishopsgate", "Cornhill", 80)).toBe("No right turn: Bishopsgate into Cornhill");
    expect(turnDescription("Upper Street", "Islington Green", -85)).toBe("No left turn: Upper Street into Islington Green");
  });

  it("names a road by its name before its number", () => {
    expect(roadName(["A10", "Shoreditch High Street"])).toBe("Shoreditch High Street");
    expect(roadName(["Bishopsgate", "A10"])).toBe("Bishopsgate");
    expect(roadName(["A501"])).toBe("A501");
    expect(roadName([])).toBe("unnamed road");
  });
});
