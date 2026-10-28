import { describe, expect, it } from "vitest";

import { EMPTY_FEED, feedNote, HOLD_MS, nextFeed, shownInfo, STALE_MS } from "../serverFeed";

const info = { road: "Holloway Road", speedLimitMph: 30, nextJunction: null };

describe("pursuit server feed", () => {
  it("shows the latest answer", () => {
    const feed = nextFeed(EMPTY_FEED, { status: "ok", info }, 1000);
    expect(shownInfo(feed, 2000)).toEqual(info);
    expect(feedNote(feed, 2000)).toBeNull();
  });

  it("says NO SIGNAL only when the network failed, keeping a recent answer marked as possibly out of date", () => {
    const ok = nextFeed(EMPTY_FEED, { status: "ok", info }, 1000);
    const lost = nextFeed(ok, { status: "no-signal" }, 9000);
    expect(shownInfo(lost, 9000)).toEqual(info);
    expect(feedNote(lost, 9000)).toEqual({ title: "NO SIGNAL", text: expect.stringMatching(/may be out of date/) });
  });

  it("says NO ANSWER, not no signal, when the server just didn't answer in time", () => {
    const slow = nextFeed(EMPTY_FEED, { status: "no-answer" }, 1000);
    const note = feedNote(slow, 1000)!;
    expect(note.title).toBe("NO ANSWER");
    expect(note.text).not.toMatch(/signal/i);
  });

  it("never shows an old speed limit: blank after 10 s without an answer", () => {
    const ok = nextFeed(EMPTY_FEED, { status: "ok", info }, 1000);
    const lost = nextFeed(ok, { status: "no-signal" }, 1000 + STALE_MS + 1);
    expect(shownInfo(lost, 1000 + STALE_MS + 1)).toBeNull();
    expect(feedNote(lost, 1000 + STALE_MS + 1)?.text).toMatch(/show “—” until it’s back/);
  });

  it("clears the trouble once the server answers again", () => {
    const lost = nextFeed(EMPTY_FEED, { status: "no-signal" }, 1000);
    expect(nextFeed(lost, { status: "ok", info }, 2000).trouble).toBeNull();
  });

  it("tells a build with no server apart from a connection problem", () => {
    const feed = nextFeed(EMPTY_FEED, { status: "unavailable" }, 1000);
    expect(feedNote(feed, 1000)).toEqual({ title: null, text: expect.stringMatching(/need the BlueRoute server/) });
  });

  it("doesn't flicker to a side road or to a blank for one answer", () => {
    const main = { road: "Clapham High Street / A3", speedLimitMph: 20, nextJunction: { name: "Cato Road", distanceM: 60 } };
    const side = { road: "Aristotle Road", speedLimitMph: 30, nextJunction: null };
    const none = { road: null, speedLimitMph: null, nextJunction: null };
    let feed = nextFeed(EMPTY_FEED, { status: "ok", info: main }, 1000);
    // One answer on a side road: still the main road and its limit.
    feed = nextFeed(feed, { status: "ok", info: side }, 2000);
    expect(shownInfo(feed, 2000)).toMatchObject({ road: main.road, speedLimitMph: 20 });
    // Back on the main road, then no road for one answer: still the main road.
    feed = nextFeed(feed, { status: "ok", info: main }, 3000);
    feed = nextFeed(feed, { status: "ok", info: none }, 4000);
    expect(shownInfo(feed, 4000)).toMatchObject({ road: main.road, nextJunction: { name: "Cato Road" } });
    // Two answers in a row on a new road: it's shown, with its own limit.
    feed = nextFeed(feed, { status: "ok", info: side }, 5000);
    feed = nextFeed(feed, { status: "ok", info: side }, 6000);
    expect(shownInfo(feed, 6000)).toEqual(side);
  });

  it("shows no road once it's been lost for longer than a moment", () => {
    const main = { road: "Clapham Road", speedLimitMph: 20, nextJunction: null };
    const none = { road: null, speedLimitMph: null, nextJunction: null };
    let feed = nextFeed(EMPTY_FEED, { status: "ok", info: main }, 1000);
    feed = nextFeed(feed, { status: "ok", info: none }, 2000);
    feed = nextFeed(feed, { status: "ok", info: none }, 1000 + HOLD_MS + 1);
    expect(shownInfo(feed, 1000 + HOLD_MS + 1)).toEqual(none);
  });

  it("says it's finding the road, not that the server is needed, before the first answer", () => {
    expect(feedNote(EMPTY_FEED, 1000)).toEqual({ title: null, text: "Finding the road…" });
  });
});
