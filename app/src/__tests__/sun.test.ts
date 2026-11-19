import { describe, expect, it } from "vitest";

import { isDaylight, sunAltitude } from "../sun";

// Central London.
const LAT = 51.507;
const LNG = -0.128;
const at = (iso: string) => isDaylight(new Date(iso), LAT, LNG);

describe("day and night by the sun", () => {
  it("is day at noon and night at midnight", () => {
    expect(at("2026-06-21T12:00:00Z")).toBe(true);
    expect(at("2026-12-21T00:00:00Z")).toBe(false);
  });

  // London, 6 November 2026: sunrise about 07:00 UTC, sunset about 16:25 UTC.
  it("turns at sunrise and sunset, to within a few minutes", () => {
    expect(at("2026-11-06T06:50:00Z")).toBe(false);
    expect(at("2026-11-06T07:10:00Z")).toBe(true);
    expect(at("2026-11-06T16:15:00Z")).toBe(true);
    expect(at("2026-11-06T16:35:00Z")).toBe(false);
  });

  // Midsummer: sunrise about 03:43 UTC, sunset about 20:21 UTC.
  it("knows long summer days", () => {
    expect(at("2026-06-21T03:30:00Z")).toBe(false);
    expect(at("2026-06-21T04:00:00Z")).toBe(true);
    expect(at("2026-06-21T20:10:00Z")).toBe(true);
    expect(at("2026-06-21T20:35:00Z")).toBe(false);
  });

  it("puts the midsummer noon sun about 62 degrees up in London", () => {
    expect(sunAltitude(new Date("2026-06-21T12:02:00Z"), LAT, LNG)).toBeCloseTo(61.9, 0);
  });
});
