import { describe, expect, it } from "vitest";

import { destinationNote } from "../destinationNote";

describe("destinationNote", () => {
  it("says nothing for a door or a road", () => {
    expect(destinationNote({ label: "53 Caledonian Road", kind: "address", precision: "door" })).toBeUndefined();
    // A number on a road-only result is now flagged as estimated (18 Nov, PM).
    expect(destinationNote({ label: "54 Caledonian Road", kind: "address", precision: "road" })).toMatch(/^Estimated position/);
    expect(destinationNote({ label: "Caledonian Road, N7", kind: "address", precision: "road" })).toBeUndefined();
  });

  it("warns that a postcode may cover several doors, unless a postcode was what was asked for", () => {
    expect(destinationNote({ label: "54 Caledonian Road", kind: "address", precision: "postcode" })).toMatch(
      /several doors/,
    );
    expect(destinationNote({ label: "N7 8LA", kind: "postcode", precision: "postcode" })).toBeUndefined();
  });
});

describe("estimated doors", () => {
  it("asks the crew to check the number when the door was worked out from its neighbours", () => {
    expect(
      destinationNote({ label: "54 Caledonian Road (estimated between 52 and 58)", kind: "address", precision: "road" } as never),
    ).toMatch(/check the number/);
    expect(destinationNote({ label: "52 Caledonian Road", kind: "address", precision: "door" } as never)).toBeUndefined();
  });
});

describe("a number with only the road found (18 Nov desk test)", () => {
  it("says the position is estimated", async () => {
    const { destinationNote } = await import("../destinationNote");
    expect(destinationNote({ label: "54 Caledonian Road", kind: "road", precision: "road" })).toMatch(/^Estimated position/);
    expect(destinationNote({ label: "Flat 3, 54 Caledonian Road", kind: "road", precision: "road" })).toMatch(/^Estimated position/);
    // A road searched for itself: nothing to warn about.
    expect(destinationNote({ label: "Caledonian Road", kind: "road", precision: "road" })).toBeUndefined();
    expect(destinationNote({ label: "54 Caledonian Road", kind: "address", precision: "door" })).toBeUndefined();
  });
});
