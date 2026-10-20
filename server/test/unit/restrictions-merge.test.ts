import { describe, expect, it } from "vitest";

import { mergeSections, type DetectedRestriction } from "../../src/restrictions.js";

type Item = DetectedRestriction & { order: number; first: number; last: number };

const at = (n: number) => ({ lat: 51.52 + n / 1000, lng: -0.134 });

function section(i: number, street: string): Item {
  return {
    kind: "bus-only",
    description: `Restricted section: ${street}`,
    location: at(i),
    locations: [],
    streets: [street],
    excludePoints: [],
    order: i,
    first: i,
    last: i + 1,
  };
}

function turn(i: number, text: string): Item {
  return { ...section(i, "x"), kind: "turn", description: text, streets: ["a", "b"], last: i + 1 };
}

describe("tidying the restriction list", () => {
  it("lists a restricted stretch of one road once, however many junctions it crosses", () => {
    const merged = mergeSections([0, 1, 2, 3].map((i) => section(i, "Tottenham Court Road")));
    expect(merged).toHaveLength(1);
    expect(merged[0]!.description).toBe("Restricted section: Tottenham Court Road");
    // Every place is still marked on the map.
    expect(merged[0]!.locations).toHaveLength(4);
  });

  it("lists the same restriction in two places once, saying so", () => {
    const merged = mergeSections([
      turn(0, "No right turn: Upper Street into Islington Green"),
      turn(10, "No left turn: Essex Road into Cross Street"),
      turn(20, "No right turn: Upper Street into Islington Green"),
    ]);
    expect(merged.map((r) => r.description)).toEqual([
      "No right turn: Upper Street into Islington Green (2 places)",
      "No left turn: Essex Road into Cross Street",
    ]);
    expect(merged[0]!.locations).toHaveLength(2);
  });

  it("keeps different roads' sections apart when they aren't joined", () => {
    const merged = mergeSections([section(0, "Gate Street"), section(5, "Other Street")]);
    expect(merged.map((r) => r.description)).toEqual(["Restricted section: Gate Street", "Restricted section: Other Street"]);
  });
});
