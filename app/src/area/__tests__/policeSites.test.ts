import { describe, expect, it } from "vitest";

import { policeSite } from "../policeSites";

describe("what a mapped police station is", () => {
  it("knows stations", () => {
    for (const n of ["Holloway Police Station", "Islington Police Station", "British Transport Police", "Margate Police Station", "MPS Acton"]) {
      expect(policeSite(n)).toBe("station");
    }
  });

  it("knows bases with no public counter", () => {
    for (const n of [
      "Safer Neighbourhoods",
      "West Wickham Ward",
      "Metropolitan Police ward office",
      "Quicksilver Patrol Base",
      "Turnpike Parade Safer Neighbourhood Team Base",
      "Roads and Transport Policing Command West Garage (TDV)",
      "Metropolitan Police Service Boat Yard",
      "Kent Police Headquarters",
      "Jaywick Neighbourhood Policing Team",
      "Limes Farm Police Office",
      "Chigwell Traffic Base",
      "Croydon Custody Centre",
    ]) {
      expect(policeSite(n)).toBe("base");
    }
  });

  it("knows what isn't police to send anyone to", () => {
    for (const n of [
      "Former smallest police station of England",
      "The Old Police House",
      "Police aux Frontières Douane Française",
      "National Crime Agency",
      "RAF Police",
      "MDP Wethersfield",
      "Metropolitan Police Forensic Science Laboratory",
      "National Visual Forensics Centre",
      "Overseas Visitors Records Office",
    ]) {
      expect(policeSite(n)).toBe("not-police");
    }
  });
});
