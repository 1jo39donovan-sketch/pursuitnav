import { describe, expect, it } from "vitest";

import { gridLetters, osgb36ToGrid, osGridRef } from "../osGrid";

describe("OS grid references", () => {
  it("projects as Ordnance Survey's worked example", () => {
    // OS guide, example: 52°39′27.2531″N, 1°43′4.5177″E (OSGB36) → E 651409.903, N 313177.270.
    const lat = 52 + 39 / 60 + 27.2531 / 3600;
    const lng = 1 + 43 / 60 + 4.5177 / 3600;
    const { e, n } = osgb36ToGrid(lat, lng);
    expect(e).toBeCloseTo(651409.903, 2);
    expect(n).toBeCloseTo(313177.27, 2);
    expect(gridLetters(e, n)).toBe("TG 51409 13177");
  });

  it("gives London grid references in TQ", () => {
    // Nelson's Column, Trafalgar Square (WGS84 51.50775, -0.12795): TQ 300 804.
    const ref = osGridRef(51.50775, -0.12795)!;
    const [letters, e, n] = ref.split(" ");
    expect(letters).toBe("TQ");
    expect(`${e!.slice(0, 3)} ${n!.slice(0, 3)}`).toBe("300 804");
  });

  it("says nothing outside the grid", () => {
    expect(osGridRef(48.8566, 2.3522)).toBeNull();
  });
});
