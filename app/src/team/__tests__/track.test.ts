import { describe, expect, it } from "vitest";

import { addFix, decodeTrack, encodeTrack, type TrackPoint } from "../track";

describe("track", () => {
  it("adds a point only after moving 25 m", () => {
    let t: TrackPoint[] = [];
    t = addFix(t, { lat: 51.5, lng: -0.1, at: 0 });
    t = addFix(t, { lat: 51.5001, lng: -0.1, at: 1000 }); // ~11 m
    t = addFix(t, { lat: 51.5003, lng: -0.1, at: 2000 }); // ~33 m
    expect(t).toHaveLength(2);
  });

  it("drops points over two hours old, and keeps at most 400", () => {
    let t: TrackPoint[] = [];
    for (let i = 0; i < 500; i++) t = addFix(t, { lat: 51.5 + i * 0.001, lng: -0.1, at: i * 1000 });
    expect(t).toHaveLength(400);
    t = addFix(t, { lat: 52, lng: -0.1, at: 3 * 3600_000 });
    expect(t).toHaveLength(1);
  });

  it("encodes compactly and back to within a metre", () => {
    const t = [
      { lat: 51.54441, lng: -0.14732, at: 0 },
      { lat: 51.5447, lng: -0.1469, at: 1 },
    ];
    const back = decodeTrack(JSON.parse(JSON.stringify(encodeTrack(t))));
    expect(back[1]!.lat).toBeCloseTo(51.5447, 5);
    expect(back[1]!.lng).toBeCloseTo(-0.1469, 5);
    expect(decodeTrack("nonsense")).toEqual([]);
  });
});
