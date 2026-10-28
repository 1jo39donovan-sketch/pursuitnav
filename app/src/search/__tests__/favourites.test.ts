import { describe, expect, it, vi } from "vitest";

import { moved, renamed, toggled } from "../favourites";

vi.mock("../../storage/store", () => ({ store: { getSetting: () => null, setSetting: () => {} } }));

const brixton = { name: "Brixton police station", lat: 51.4613, lng: -0.1156, borough: "Lambeth" };
const kings = { name: "King's College Hospital", lat: 51.468, lng: -0.0938, borough: "Southwark" };

describe("favourites", () => {
  it("renames, keeping the old name if the new one is blank", () => {
    const list = [brixton, kings];
    expect(renamed(list, 0, "  Brixton nick ")[0]!.name).toBe("Brixton nick");
    expect(renamed(list, 0, "   ")).toBe(list);
  });

  it("moves one up or down, not past either end", () => {
    const list = toggled(toggled([], kings), brixton); // Brixton first
    expect(moved(list, 1, -1).map((f) => f.name)).toEqual([kings.name, brixton.name]);
    expect(moved(list, 0, -1)).toBe(list);
    expect(moved(list, 1, 1)).toBe(list);
  });
});
