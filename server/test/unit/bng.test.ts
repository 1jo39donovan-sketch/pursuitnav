import { describe, expect, it } from "vitest";

import { bngToWgs84, gridToOsgb36 } from "../../src/bng.js";
import { distanceM } from "../../src/geo.js";

const deg = (r: number) => (r * 180) / Math.PI;

describe("British National Grid to WGS84", () => {
  it("matches OS's worked example for the projection (OSGB36)", () => {
    // OS, "A guide to coordinate systems in Great Britain", C.2: E 651409.903, N 313177.270
    // is 52°39′27.2531″N, 1°43′4.5177″E on OSGB36.
    const { lat, lon } = gridToOsgb36(651409.903, 313177.27);
    expect(deg(lat)).toBeCloseTo(52 + 39 / 60 + 27.2531 / 3600, 6);
    expect(deg(lon)).toBeCloseTo(1 + 43 / 60 + 4.5177 / 3600, 6);
  });

  it("gives WGS84 positions within 5 m across London", () => {
    // Reference values from PROJ (EPSG:27700 to EPSG:4326, OS Helmert, 2 m accuracy).
    const cases: [number, number, number, number][] = [
      [530047, 180426, 51.50780833779845, -0.12752021587530482], // Trafalgar Square
      [510000, 160000, 51.32847012680275, -0.4225846675643545],
      [560000, 200000, 51.67598245364889, 0.3126532215271884],
      [651409.903, 313177.27, 52.65797859857984, 1.7160519903750366], // OS's example point
    ];
    for (const [e, n, lat, lng] of cases) {
      const got = bngToWgs84(e, n);
      expect(distanceM([got.lng, got.lat], [lng, lat])).toBeLessThan(5);
    }
  });
});
