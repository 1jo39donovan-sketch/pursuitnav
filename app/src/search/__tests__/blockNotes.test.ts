import { describe, expect, it, vi } from "vitest";

import { noteNear, parseNotes, withNote } from "../blockNotes";

vi.mock("../../storage/store", () => ({ store: { getSetting: () => null, setSetting: () => {} } }));

const smith = { lat: 51.5463, lng: -0.1171, name: "Smith House" };

describe("block notes", () => {
  it("finds a note by the block, from its entrance too, and not from down the road", () => {
    const list = withNote([], smith, "Lift to 4th floor, flats 1–24 via entrance A");
    expect(noteNear(list, { lat: 51.54645, lng: -0.11725 })?.note).toMatch(/4th floor/);
    expect(noteNear(list, { lat: 51.548, lng: -0.1171 })).toBeNull();
  });

  it("replaces a block's note, and removes it when emptied", () => {
    let list = withNote([], smith, "old");
    list = withNote(list, { ...smith, lat: smith.lat + 0.0001 }, "new");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ note: "new", name: "Smith House", lat: smith.lat });
    expect(withNote(list, smith, "  ")).toEqual([]);
  });

  it("ignores a damaged list", () => {
    expect(parseNotes("{")).toEqual([]);
  });
});
