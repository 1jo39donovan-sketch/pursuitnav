import { describe, expect, it } from "vitest";

import { roadLabel, streetName } from "../../src/pursuit.js";

describe("road names in pursuit mode", () => {
  it("says the name and the number, name first, whichever order OSM gives them", () => {
    expect(roadLabel(["A1", "Holloway Road"])).toBe("Holloway Road / A1");
    expect(roadLabel(["Holloway Road", "A1"])).toBe("Holloway Road / A1");
    expect(roadLabel(["Westway", "A40(M)"])).toBe("Westway / A40(M)");
  });

  it("gives the name or the number alone when that's all there is", () => {
    expect(roadLabel(["Caledonian Road"])).toBe("Caledonian Road");
    expect(roadLabel(["M25"])).toBe("M25");
    expect(roadLabel([])).toBeNull();
  });

  it("names the road at a junction by its name, not its number", () => {
    expect(streetName(["A503", "Seven Sisters Road"])).toBe("Seven Sisters Road");
    expect(streetName(["A503"])).toBe("A503");
  });
});
