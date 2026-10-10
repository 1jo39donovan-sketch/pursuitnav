import { describe, expect, it } from "vitest";

import { bearingDeg, cumulativeDistances, decodePolyline6, distanceM, pointAlong, turnAngle } from "../../src/geo.js";

function encodePolyline6(points: [number, number][]): string {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [lng, lat] of points) {
    const la = Math.round(lat * 1e6);
    const ln = Math.round(lng * 1e6);
    enc(la - prevLat);
    enc(ln - prevLng);
    prevLat = la;
    prevLng = ln;
  }
  return out;
}

describe("decodePolyline6", () => {
  it("round-trips London coordinates, including negative longitudes", () => {
    const pts: [number, number][] = [
      [-0.1276, 51.5072],
      [-0.103512, 51.546601],
      [0.012345, 51.4]
    ];
    const decoded = decodePolyline6(encodePolyline6(pts));
    expect(decoded).toHaveLength(3);
    decoded.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(pts[i]![0], 6);
      expect(p[1]).toBeCloseTo(pts[i]![1], 6);
    });
  });
});

describe("distance and bearing", () => {
  it("measures about 111 km per degree of latitude", () => {
    expect(distanceM([0, 51], [0, 52]) / 1000).toBeCloseTo(111.2, 0);
  });

  it("gives compass bearings", () => {
    expect(bearingDeg([0, 51], [0, 52])).toBeCloseTo(0, 5);
    expect(bearingDeg([0, 51], [0.1, 51])).toBeCloseTo(90, 0);
    expect(bearingDeg([0, 51], [0, 50])).toBeCloseTo(180, 5);
    expect(bearingDeg([0, 51], [-0.1, 51])).toBeCloseTo(270, 0);
  });
});

describe("turnAngle", () => {
  it("is positive for right turns and negative for left (UK: right crosses traffic)", () => {
    expect(turnAngle(90, 180)).toBe(90); // east, then south: right
    expect(turnAngle(90, 0)).toBe(-90); // east, then north: left
    expect(turnAngle(350, 10)).toBe(20); // across north
    expect(Math.abs(turnAngle(0, 180))).toBe(180);
  });
});

describe("pointAlong", () => {
  const line: [number, number][] = [
    [0, 51],
    [0, 51.001],
    [0.002, 51.001],
  ];
  const cum = cumulativeDistances(line);

  it("finds points and headings along a polyline", () => {
    const mid = pointAlong(line, cum, cum[1]! / 2);
    expect(mid.point[1]).toBeCloseTo(51.0005, 6);
    expect(mid.heading).toBeCloseTo(0, 3);
    const later = pointAlong(line, cum, cum[1]! + 10);
    expect(later.heading).toBeCloseTo(90, 0);
  });

  it("clamps to the ends", () => {
    expect(pointAlong(line, cum, -5).point).toEqual(line[0]);
    expect(pointAlong(line, cum, 1e9).point).toEqual(line[2]);
  });
});
