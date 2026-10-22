import { describe, expect, it } from "vitest";

import { destinationNote } from "../destinationNote";

describe("destinationNote", () => {
  it("warns when a numbered address was found only as its road", () => {
    expect(destinationNote({ label: "54 Caledonian Road", kind: "address", precision: "road" })).toMatch(
      /not the door/,
    );
    expect(destinationNote({ label: "Flat 3, 54 Caledonian Road", kind: "road", precision: "road" })).toMatch(
      /not the door/,
    );
    expect(
      destinationNote({
        label: "53 Caledonian Road (estimated point on the road)",
        kind: "address",
        precision: "road",
      }),
    ).toMatch(/not the door/);
  });

  it("says nothing for a door, or a road asked for by name", () => {
    expect(destinationNote({ label: "53 Caledonian Road", kind: "address", precision: "door" })).toBeUndefined();
    expect(destinationNote({ label: "Caledonian Road, N7", kind: "address", precision: "road" })).toBeUndefined();
  });

  it("warns that a postcode may cover several doors, unless a postcode was what was asked for", () => {
    expect(destinationNote({ label: "54 Caledonian Road", kind: "address", precision: "postcode" })).toMatch(
      /several doors/,
    );
    expect(destinationNote({ label: "N7 8LA", kind: "postcode", precision: "postcode" })).toBeUndefined();
  });
});
