import { describe, expect, it } from "vitest";

import type { PointOfInterest } from "../../search/places";
import { isAE } from "../../search/quickPlaces";
import { servicePoints } from "../../components/mapServices";
import { withAeCorrections } from "../emergencyDepartments";

const poi = (name: string, type: string, borough: string): PointOfInterest =>
  ({ name, type, borough, lat: 51.55, lng: -0.12, group: "health", otherNames: [], address: "" }) as PointOfInterest;

describe("A&E corrections (17 Nov audit)", () => {
  const fixed = withAeCorrections([
    poi("The Whittington Hospital", "Hospital", "Islington"),
    poi("Queen Elizabeth The Queen Mother Hospital", "Hospital", "Thanet"),
    poi("Tunbridge Wells Nuffield Hospital", "Hospital with A&E", "Tunbridge Wells"),
    poi("Central Middlesex Hospital", "Hospital with A&E", "Brent"),
    poi("Moorfields Eye Hospital (City Road campus)", "Hospital with A&E", "Islington"),
    poi("Evelina London Children's Hospital", "Hospital with A&E", "Lambeth"),
    poi("Royal Free Hospital", "Hospital with A&E", "Camden"),
    poi("Whittington Café", "Coffee shop", "Islington"),
  ]);
  const byName = new Map(fixed.map((p) => [p.name, p]));

  it("adds the emergency departments OpenStreetMap misses", () => {
    expect(isAE(byName.get("The Whittington Hospital")!)).toBe(true);
    expect(isAE(byName.get("Queen Elizabeth The Queen Mother Hospital")!)).toBe(true);
  });

  it("takes away the ones wrongly marked", () => {
    expect(isAE(byName.get("Tunbridge Wells Nuffield Hospital")!)).toBe(false);
    expect(isAE(byName.get("Central Middlesex Hospital")!)).toBe(false);
  });

  it("keeps specialist ones on the map, but not as Nearest A&E", () => {
    const eye = byName.get("Moorfields Eye Hospital (City Road campus)")!;
    expect(eye.type).toBe("Eye A&E");
    expect(isAE(eye)).toBe(false);
    const card = servicePoints([eye]).features[0]!.properties!;
    expect(card.type).toBe("Eye A&E");
    expect(card.notes).toMatch(/Eye emergencies only/);
    expect(byName.get("Evelina London Children's Hospital")!.type).toBe("Children's A&E");
  });

  it("leaves everything else alone, including a café of the same name", () => {
    expect(byName.get("Royal Free Hospital")!.type).toBe("Hospital with A&E");
    expect(byName.get("Whittington Café")!.type).toBe("Coffee shop");
  });
});
