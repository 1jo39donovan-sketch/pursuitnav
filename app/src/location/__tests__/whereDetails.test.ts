import { describe, expect, it } from "vitest";

import { shareText, shouldLookUp, whereDetails } from "../../location/whereDetails";

const fix = { lat: 51.52801, lng: -0.18421, accuracy: 6.4, speed: 0, course: null, timestamp: Date.UTC(2026, 9, 23, 14, 5, 22) };

describe("where am I", () => {
  it("uses the server's door and postcode when it answers", () => {
    const d = whereDetails(fix, { door: "123 Maida Vale", road: "Maida Vale", postcode: "W9 1QE" }, { postcode: "W9 1QD", distanceM: 80 });
    expect(d.address).toBe("≈ 123 Maida Vale");
    expect(d.postcode).toBe("W9 1QE");
    expect(d.postcodeNote).toBeNull();
    expect(d.grid).toMatch(/^TQ \d{5} \d{5}$/);
    expect(d.accuracyM).toBe(6);
  });

  it("falls back to what the phone knows with no signal, and says so", () => {
    const d = whereDetails(fix, null, { postcode: "W9 1QD", distanceM: 80 });
    expect(d.address).toBeNull();
    expect(d.postcode).toBe("W9 1QD");
    expect(d.postcodeNote).toBe("nearest postcode centre, 80 m away");
  });

  it("shares a message with a map link", () => {
    const text = shareText(whereDetails(fix, { door: "123 Maida Vale", road: "Maida Vale", postcode: "W9 1QE" }, null));
    expect(text).toContain("≈ 123 Maida Vale, W9 1QE");
    expect(text).toContain("OS grid TQ");
    expect(text).toContain("51.52801, -0.18421 (±6 m");
    expect(text.endsWith("https://maps.google.com/?q=51.52801,-0.18421")).toBe(true);
  });
});

describe("keeping up while open", () => {
  it("looks the address up again after 15 m or 20 s, not on every fix", () => {
    const last = { lat: 51.528, lng: -0.1842, at: 0 };
    expect(shouldLookUp(null, last, 0)).toBe(true);
    expect(shouldLookUp(last, { lat: 51.52805, lng: -0.1842 }, 5000)).toBe(false); // ~6 m, 5 s
    expect(shouldLookUp(last, { lat: 51.5282, lng: -0.1842 }, 5000)).toBe(true); // ~22 m
    expect(shouldLookUp(last, last, 20_000)).toBe(true);
  });
});
