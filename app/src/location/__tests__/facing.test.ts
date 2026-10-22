import { describe, expect, it } from "vitest";

import { facing } from "../facing";

describe("facing", () => {
  it("is the direction of travel while moving", () => {
    expect(facing({ speed: 10, course: 90 }, 200, 300)).toBe(90);
  });

  it("keeps the last direction of travel when stopped", () => {
    expect(facing({ speed: 0, course: null }, 200, 300)).toBe(200);
    // A course at walking pace is noise, not a direction.
    expect(facing({ speed: 1, course: 45 }, 200, 300)).toBe(200);
  });

  it("uses the compass before the vehicle has moved", () => {
    expect(facing({ speed: 0, course: null }, null, 300)).toBe(300);
  });

  it("is unknown with nothing to go on, so the map shows a dot", () => {
    expect(facing({ speed: null, course: null }, null, null)).toBeNull();
    expect(facing(null, null, null)).toBeNull();
  });
});
