import { describe, expect, it } from "vitest";

import { parseAddressQuery } from "../../src/addressQuery.js";

describe("parseAddressQuery", () => {
  it("splits what the control room gave into its parts", () => {
    expect(parseAddressQuery("Flat 3, 54 Caledonian Rd, N7 8LA")).toEqual({
      unit: "Flat 3",
      number: "54",
      text: "Caledonian Rd",
      postcode: "N7 8LA",
    });
    expect(parseAddressQuery("53 Caledonian Road, N7")).toEqual({
      number: "53",
      text: "Caledonian Road",
      outward: "N7",
    });
    expect(parseAddressQuery("53 Caledonian Road")).toEqual({ number: "53", text: "Caledonian Road" });
    expect(parseAddressQuery("Smith House, Holloway Road")).toEqual({ text: "Smith House, Holloway Road" });
    expect(parseAddressQuery("Bedminton Estate")).toEqual({ text: "Bedminton Estate" });
  });

  it("takes a house number written after the street", () => {
    expect(parseAddressQuery("Caledonian Road 53, N7 8LA")).toEqual({
      number: "53",
      text: "Caledonian Road",
      postcode: "N7 8LA",
    });
    expect(parseAddressQuery("Smith Street, 21a")).toEqual({ number: "21a", text: "Smith Street" });
    expect(parseAddressQuery("Flat 3, Caledonian Rd 54")).toMatchObject({ unit: "Flat 3", number: "54" });
  });

  it("knows a postcode or district on its own", () => {
    expect(parseAddressQuery("n78la")).toEqual({ text: "", postcode: "N7 8LA" });
    expect(parseAddressQuery("N7")).toEqual({ text: "", outward: "N7" });
  });

  it("doesn't take a road number or a word for a postcode", () => {
    expect(parseAddressQuery("A1 Holloway Road")).toEqual({ text: "A1 Holloway Road" });
    expect(parseAddressQuery("54-56 Caledonian Road")).toMatchObject({ number: "54-56", text: "Caledonian Road" });
  });
});
