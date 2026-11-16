import { describe, expect, it } from "vitest";

import { cautionsNear, spokenArrival, toMessage, type SealedMessage } from "../messages";

const sealed = (over: Partial<SealedMessage> = {}): SealedMessage => ({
  id: "m1",
  from: "desk",
  blob: "x",
  at: 1000,
  expiresAt: 1000 + 12 * 3600_000,
  ...over,
});
const go = { v: 1, kind: "go", cs: "DESK-1", to: null, text: "Concern for welfare", place: { lat: 51.54, lng: -0.11, label: "54 Caledonian Road" } };

describe("team messages", () => {
  it("shows a message to everyone, or only to the callsign it was sent to (and its sender)", () => {
    expect(toMessage(sealed(), go, "me", 2000)).toMatchObject({ kind: "go", cs: "DESK-1", mine: false });
    const toOther = { ...go, to: "someone-else" };
    expect(toMessage(sealed(), toOther, "me", 2000)).toBeNull();
    expect(toMessage(sealed(), { ...go, to: "me" }, "me", 2000)).not.toBeNull();
    expect(toMessage(sealed({ from: "me" }), toOther, "me", 2000)).toMatchObject({ mine: true });
  });

  it("drops what's run out, can't be read, or lacks the place a Go or Caution needs", () => {
    expect(toMessage(sealed({ expiresAt: 1500 }), go, "me", 2000)).toBeNull();
    expect(toMessage(sealed(), null, "me", 2000)).toBeNull();
    expect(toMessage(sealed(), { ...go, place: undefined }, "me", 2000)).toBeNull();
    expect(toMessage(sealed(), { ...go, kind: "note", place: undefined }, "me", 2000)).toMatchObject({ kind: "note" });
    expect(toMessage(sealed(), { ...go, kind: "launch-missiles" }, "me", 2000)).toBeNull();
  });

  it("says who it's from and where, briefly", () => {
    const m = toMessage(sealed(), go, "me", 2000)!;
    expect(spokenArrival(m)).toBe("Team message from DESK-1. Go to 54 Caledonian Road. Concern for welfare");
  });

  it("finds a colleague's caution within 150 m, never your own", () => {
    const caution = toMessage(sealed(), { ...go, kind: "caution", text: "Dog loose, side gate" }, "me", 2000)!;
    const mine = { ...caution, id: "m2", mine: true };
    expect(cautionsNear([caution, mine], { lat: 51.5405, lng: -0.11 }).map((m) => m.id)).toEqual(["m1"]);
    expect(cautionsNear([caution], { lat: 51.55, lng: -0.11 })).toEqual([]);
  });
});
