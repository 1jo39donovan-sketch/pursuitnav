// Pursuit lookups against a real Valhalla on the synthetic network: road,
// signed speed limit (or none), and the next junction ahead.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import type { PursuitInfo } from "../../src/pursuit.js";
import { ValhallaClient } from "../../src/valhalla.js";

const points = inject("points");
const client = new ValhallaClient(inject("valhallaUrl"));
const app = buildApp({ bounds: [-0.8, 51.2, 0.6, 51.8] } as ServerConfig, client, undefined, client);
beforeAll(() => app.ready());
afterAll(() => app.close());

/** A short eastbound trace ending at the given point. */
function eastboundTo(p: { lat: number; lng: number }) {
  return [0.0006, 0.0004, 0.0002, 0].map((d) => ({ lat: p.lat, lng: p.lng - d }));
}

async function lookup(body: object): Promise<PursuitInfo> {
  const res = await app.inject({ method: "POST", url: "/v1/pursuit", payload: body });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as PursuitInfo;
}

describe("POST /v1/pursuit", () => {
  it("shows no speed limit for a road without one, rather than guessing", async () => {
    const info = await lookup({ points: eastboundTo(points.unsigned_near_split!), heading: 90 });
    expect(info.road).toBe("Unsigned Road");
    expect(info.speedLimitMph).toBeNull();
  });

  it("finds the next junction, passing through a split in the same road", async () => {
    // ~35 m before the split at column 1, then 208 m on to Cross Street.
    const info = await lookup({ points: eastboundTo(points.unsigned_near_split!), heading: 90 });
    expect(info.nextJunction?.name).toBe("Cross Street");
    expect(info.nextJunction!.distanceM).toBeGreaterThan(220);
    expect(info.nextJunction!.distanceM).toBeLessThan(260);
  });

  it("reads a signed limit in mph", async () => {
    const s = points.cross_south!;
    const trace = [0.0006, 0.0004, 0.0002, 0.0001].map((d) => ({ lat: s.lat + 0.0002 + (0.0006 - d), lng: s.lng }));
    const info = await lookup({ points: trace, heading: 0 });
    expect(info.road).toBe("Cross Street");
    expect(info.speedLimitMph).toBe(30);
    expect(info.nextJunction?.name).toBe("Unsigned Road");
  });

  it("works out the direction from the trace when there's no GPS course", async () => {
    const info = await lookup({ points: eastboundTo(points.unsigned_near_split!) });
    expect(info.nextJunction?.name).toBe("Cross Street");
  });

  it("refuses points outside the area", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/pursuit", payload: { points: [{ lat: 53.4, lng: -2.2 }] } });
    expect(res.statusCode).toBe(422);
  });
});
