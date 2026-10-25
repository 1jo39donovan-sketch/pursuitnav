import { describe, expect, it } from "vitest";

import type { Entrance } from "../../api/entrances";
import { addressParts, bestEntrance, entranceLabel, entrancesFor, servesFlat } from "../entrances";

const e = (over: Partial<Entrance>): Entrance => ({
  lat: 51.5463,
  lng: -0.1171,
  kind: "yes",
  ref: "",
  name: "",
  housenumber: "",
  street: "",
  flats: "",
  metres: 10,
  ...over,
});

describe("entrances", () => {
  it("reads the flat and house number from an address", () => {
    expect(addressParts("Flat 3, 54 Caledonian Road")).toEqual({ housenumber: "54", flat: 3 });
    expect(addressParts("54a Caledonian Road, N7 8LA")).toEqual({ housenumber: "54a", flat: null });
    expect(addressParts("Smith House")).toEqual({ housenumber: null, flat: null });
  });

  it("knows which flats an entrance serves", () => {
    expect(servesFlat("1-24", 3)).toBe(true);
    expect(servesFlat("25-48", 3)).toBe(false);
    expect(servesFlat("1-10;12", 12)).toBe(true);
  });

  it("picks the entrance for the flat, then the number, then the main door, then the nearest", () => {
    const main = e({ kind: "main", ref: "A", flats: "1-24", metres: 20 });
    const b = e({ kind: "staircase", ref: "B", flats: "25-48", metres: 5 });
    expect(bestEntrance([main, b], "Flat 30, 54 Caledonian Road")).toBe(b);
    expect(bestEntrance([main, b], "Flat 3, 54 Caledonian Road")).toBe(main);
    expect(bestEntrance([main, b], "54 Caledonian Road")).toBe(main);
    const numbered = e({ housenumber: "56", metres: 15 });
    expect(bestEntrance([main, numbered], "56 Caledonian Road")).toBe(numbered);
    expect(bestEntrance([], "54 Caledonian Road")).toBeNull();
  });

  it("says which entrance in a few words", () => {
    expect(entranceLabel(e({ kind: "main", ref: "A", flats: "1-24" }))).toBe("Main entrance A · flats 1–24");
    expect(entranceLabel(e({ housenumber: "56" }))).toBe("Entrance · no. 56");
  });

  it("never sends a crew to the neighbour's door", () => {
    const neighbour = e({ kind: "main", housenumber: "56", metres: 6 });
    const unnumberedFar = e({ kind: "main", metres: 35 });
    const own = e({ housenumber: "54", metres: 12 });
    expect(entrancesFor([neighbour, unnumberedFar], "54 Caledonian Road", 20)).toEqual([]);
    expect(entrancesFor([neighbour, own], "54 Caledonian Road", 20)).toEqual([own]);
    // A whole block, found by name: unnumbered entrances further out count.
    expect(entrancesFor([unnumberedFar], "Smith House", 40)).toEqual([unnumberedFar]);
    // The flat's own entrance counts wherever it is.
    expect(entrancesFor([e({ flats: "25-48", metres: 50 })], "Flat 30, Smith House", 20)).toHaveLength(1);
  });
});
