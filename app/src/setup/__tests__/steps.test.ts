import { describe, expect, it } from "vitest";

import { SETUP_STEPS, needsSetup, nextStep, previousStep, stepLabel } from "../steps";

describe("first-launch setup", () => {
  it("asks service, area, vehicle, callsign, then blue light", () => {
    expect(SETUP_STEPS).toEqual(["service", "region", "areas", "vehicle", "callsign", "blueLight"]);
  });

  it("shows only on a fresh install", () => {
    expect(needsSetup({ done: null, service: null, areas: 0 })).toBe(true);
    expect(needsSetup({ done: "2026-11-05", service: null, areas: 0 })).toBe(false);
    // Set up on Session before setup existed: not asked again.
    expect(needsSetup({ done: null, service: "police", areas: 0 })).toBe(false);
    expect(needsSetup({ done: null, service: null, areas: 3 })).toBe(false);
  });

  it("moves forward and back one question at a time", () => {
    expect(nextStep("service")).toBe("region");
    expect(nextStep("blueLight")).toBeNull();
    expect(previousStep("service")).toBeNull();
    expect(previousStep("vehicle")).toBe("areas");
    expect(stepLabel("region")).toBe("Step 2 of 6");
  });
});
