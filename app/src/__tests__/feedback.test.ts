import { describe, expect, it, vi } from "vitest";

import { reportBody, reportUrl } from "../feedback";

vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "1.2.3" } } }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../config", () => ({ SUPPORT_EMAIL: "support@example.org" }));

const report = {
  kind: "police" as const,
  vehicle: "car",
  roads: "main",
  mapLook: "standard",
  distanceM: 5000,
  durationS: 600,
  restrictions: 2,
};

describe("route problem report", () => {
  it("says how the route was made, never where", () => {
    const body = reportBody(report, "1.2.3", "ios");
    expect(body).toContain("Route: Blue light");
    expect(body).toContain("Length: 3.1 miles, 10 min");
    expect(body).toContain("Restrictions used: 2");
    expect(body).toContain("App: 1.2.3 (ios)");
    expect(body).not.toMatch(/lat|lng|street|road:/i);
  });

  it("is an email to support, written in the tester's own mail app", () => {
    const url = reportUrl(report);
    expect(url.startsWith("mailto:support@example.org?subject=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("Don't include addresses".replace("Don't", "don't"));
  });
});

describe("flagged routes, sent together after END", () => {
  it("one flag is the same email as before", async () => {
    const { flagsBody } = await import("../feedback");
    expect(flagsBody([report], "1.2.3", "ios")).toBe(reportBody(report, "1.2.3", "ios"));
  });

  it("several go in one email: the question once, then each route", async () => {
    const { flagsBody, flagsUrl } = await import("../feedback");
    const body = flagsBody([report, { ...report, kind: "standard", restrictions: undefined }], "1.2.3", "ios");
    expect(body.match(/What went wrong/g)).toHaveLength(1);
    expect(body).toContain("— Route 1 of 2");
    expect(body).toContain("— Route 2 of 2");
    expect(body).toContain("Route: Blue light");
    expect(body).toContain("Route: Standard");
    expect(body).not.toMatch(/lat|lng|street|road:/i);
    expect(decodeURIComponent(flagsUrl([report, report]))).toContain("problems with 2 routes");
  });
});
