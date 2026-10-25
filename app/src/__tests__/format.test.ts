import { describe, expect, it } from "vitest";

import { roadLabel } from "../format";

describe("roadLabel", () => {
  it("puts the road's name first, then its number, whatever order they come in", () => {
    expect(roadLabel(["A1", "Holloway Road"])).toBe("Holloway Road / A1");
    expect(roadLabel(["Holloway Road", "A1"])).toBe("Holloway Road / A1");
  });

  it("gives the name or number alone, or nothing", () => {
    expect(roadLabel(["Upper Street"])).toBe("Upper Street");
    expect(roadLabel(["a406"])).toBe("A406");
    expect(roadLabel([])).toBeNull();
  });
});
