import { describe, expect, it } from "vitest";

import { atPoliceStation, shareDecision, type ShareInputs } from "../sharePolicy";

// Brixton police station, roughly.
const station = { lat: 51.4613, lng: -0.1156 };
const north = (m: number) => ({ lat: station.lat + m / 111_320, lng: station.lng, accuracy: 10 });

const base: ShareInputs = {
  policy: "always",
  batterySaver: false,
  shareAtPolice: false,
  atPolice: false,
  navigating: false,
  destination: null,
  fix: { lat: 51.5, lng: -0.1 },
};

describe("at a police station", () => {
  it("hides on arriving, and only shows again well clear on a good fix", () => {
    expect(atPoliceStation(false, north(50), [station])).toBe(true);
    expect(atPoliceStation(false, north(100), [station])).toBe(false);
    // Inside, GPS bouncing out to 100 m: still hidden.
    expect(atPoliceStation(true, north(100), [station])).toBe(true);
    // Clear of it, but on a poor fix: still hidden.
    expect(atPoliceStation(true, { ...north(150), accuracy: 200 }, [station])).toBe(true);
    expect(atPoliceStation(true, north(150), [station])).toBe(false);
    // No fix (no signal inside): stays as it was.
    expect(atPoliceStation(true, null, [station])).toBe(true);
  });
});

describe("when to share", () => {
  it("never at a police station, unless the crew says so", () => {
    expect(shareDecision({ ...base, atPolice: true }).share).toBe(false);
    expect(shareDecision({ ...base, atPolice: true, shareAtPolice: true }).share).toBe(true);
  });

  it("follows the crew's choice: always, navigating, on scene", () => {
    expect(shareDecision(base).share).toBe(true);
    expect(shareDecision({ ...base, policy: "navigating" }).share).toBe(false);
    expect(shareDecision({ ...base, policy: "navigating", navigating: true }).share).toBe(true);
    const job = { lat: 51.5, lng: -0.1 };
    expect(shareDecision({ ...base, policy: "arrived", destination: job, fix: { lat: 51.5005, lng: -0.1 } }).share).toBe(true);
    expect(shareDecision({ ...base, policy: "arrived", destination: job, fix: { lat: 51.51, lng: -0.1 } }).share).toBe(false);
  });

  it("battery saver shares only while navigating", () => {
    expect(shareDecision({ ...base, batterySaver: true }).share).toBe(false);
    expect(shareDecision({ ...base, batterySaver: true, navigating: true }).share).toBe(true);
  });
});
