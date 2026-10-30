// POST /v1/pursuit: the road and limit never wait long for the house number.
import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import type { Matcher, Router } from "../../src/valhalla.js";

const config = { bounds: [-0.8, 51.2, 0.6, 51.8] } as ServerConfig;
const matcher: Matcher = {
  matchRoad: async () => ({ names: ["Holloway Road", "A1"], speedLimitKph: 48 }),
  locate: async () => [],
};
const points = [
  { lat: 51.556, lng: -0.118 },
  { lat: 51.5562, lng: -0.118 },
];

describe("POST /v1/pursuit", () => {
  it("answers with the road without waiting for a slow house number", async () => {
    const slowDoor = () => new Promise<string | null>((done) => setTimeout(() => done("40 Holloway Road"), 5000));
    const app = buildApp(config, {} as Router, undefined, matcher, undefined, undefined, undefined, undefined, slowDoor);
    const started = Date.now();
    const res = await app.inject({ method: "POST", url: "/v1/pursuit", payload: { points } });
    expect(Date.now() - started).toBeLessThan(1500);
    expect(res.json()).toMatchObject({ road: "Holloway Road / A1", speedLimitMph: 30, near: null });
    expect(res.headers["server-timing"]).toMatch(/^pursuit;dur=\d+$/);
  });

  it("includes the house number when it's quick", async () => {
    const app = buildApp(config, {} as Router, undefined, matcher, undefined, undefined, undefined, undefined, async () => "40 Holloway Road");
    const res = await app.inject({ method: "POST", url: "/v1/pursuit", payload: { points } });
    expect(res.json().near).toBe("40 Holloway Road");
  });
});
