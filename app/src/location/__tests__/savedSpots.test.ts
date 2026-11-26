import { describe, expect, it } from "vitest";

import { addSpot, loadSpots, SAVED_SPOTS_MAX, saveSpots, spotText, type SavedSpot } from "../savedSpots";

const spot = (n: number): SavedSpot => ({
  address: `${n} Caledonian Road`,
  postcode: "N1 9DT",
  postcodeNote: null,
  borough: "Islington",
  grid: "TQ 30634 83480",
  latLng: "51.53220, -0.12010",
  accuracyM: 6,
  at: Date.UTC(2026, 10, 26, 14, 5, 10) + n,
  savedAt: Date.UTC(2026, 10, 26, 14, 5, 12) + n * 60_000,
});

const memory = () => {
  const m = new Map<string, string>();
  return { getSetting: (k: string) => m.get(k) ?? null, setSetting: (k: string, v: string) => void m.set(k, v) };
};

describe("saved spots (Where am I → Save spot, for arrest notes)", () => {
  it("keeps the last five, newest first", () => {
    let list: SavedSpot[] = [];
    for (let n = 1; n <= 7; n++) list = addSpot(list, spot(n));
    expect(list).toHaveLength(SAVED_SPOTS_MAX);
    expect(list.map((s) => s.address)).toEqual([7, 6, 5, 4, 3].map((n) => `${n} Caledonian Road`));
  });

  it("survives closing the app: kept on the phone", () => {
    const store = memory();
    saveSpots(store, [spot(2), spot(1)]);
    expect(loadSpots(store).map((s) => s.address)).toEqual(["2 Caledonian Road", "1 Caledonian Road"]);
  });

  it("ignores anything damaged rather than crash", () => {
    const store = memory();
    store.setSetting("savedSpots", "{not json");
    expect(loadSpots(store)).toEqual([]);
    store.setSetting("savedSpots", JSON.stringify([{ address: "no time" }, spot(1)]));
    expect(loadSpots(store)).toHaveLength(1);
  });

  it("shares with the date and time saved, the address, grid reference and position", () => {
    const text = spotText(spot(1));
    expect(text).toMatch(/^Saved location \(BlueRoute\), .*26 Nov/);
    expect(text).toContain("1 Caledonian Road, N1 9DT, Islington");
    expect(text).toContain("OS grid TQ 30634 83480");
    expect(text).toContain("51.53220, -0.12010 (±6 m");
  });
});
