import { describe, expect, it } from "vitest";

import { policeSite } from "../serviceSites";

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

describe("fire and ambulance stations", () => {
  it("tells the brigade's and the NHS's own from the rest", async () => {
    const { fireSite, ambulanceSite } = await import("../serviceSites");
    expect(fireSite("Islington Fire Station").site).toBe("service");
    expect(fireSite("Station E11 Dovercourt").site).toBe("service");
    expect(fireSite("The Old Firestation").site).toBe("none");
    expect(fireSite("RAF Northolt Fire Station")).toEqual({ site: "other", operator: "RAF fire service" });
    expect(fireSite("Heathrow Airport Fire Service - Station 2 'Fire East'").site).toBe("other");
    expect(fireSite("LCY Airfield Fire Station").site).toBe("other");
    expect(fireSite("FEMC Fire Station").site).toBe("other");
    expect(ambulanceSite("Camden Ambulance Station").site).toBe("service");
    expect(ambulanceSite("LAS HART Base East").site).toBe("service");
    expect(ambulanceSite("St John's Amulance").site).toBe("other");
    expect(ambulanceSite("St John Ambulance Walthamstow Headquarters").site).toBe("other");
    expect(ambulanceSite("A&E department").site).toBe("none");
    expect(ambulanceSite("Vehicle Logistics Centre").site).toBe("none");
  });
});

describe("stations offered as nearest (18 Nov desk test)", () => {
  it("leaves out ward bases", async () => {
    const { offeredStation } = await import("../serviceSites");
    expect(offeredStation({ type: "Police station", name: "Clerkenwell and Bunhill Wards Police Station" })).toBe(false);
    expect(offeredStation({ type: "Police station", name: "Camden Town with Primrose Hill Ward" })).toBe(false);
    expect(offeredStation({ type: "Police station", name: "Holborn Police Station" })).toBe(true);
    expect(offeredStation({ type: "Fire station", name: "RAF Northolt Fire Station" })).toBe(false);
    expect(offeredStation({ type: "Hospital", name: "Anything" })).toBe(true);
  });
});
