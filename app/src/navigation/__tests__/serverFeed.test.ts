import { describe, expect, it } from "vitest";

import { EMPTY_FEED, feedNote, nextFeed, shownInfo, STALE_MS } from "../serverFeed";

const info = { road: "Holloway Road", speedLimitMph: 30, nextJunction: null };

describe("pursuit server feed", () => {
  it("shows the latest answer", () => {
    const feed = nextFeed(EMPTY_FEED, { status: "ok", info }, 1000);
    expect(shownInfo(feed, 2000)).toEqual(info);
    expect(feedNote(feed, 2000)).toBeNull();
  });

  it("says no signal, and keeps a recent answer marked as possibly out of date", () => {
    const ok = nextFeed(EMPTY_FEED, { status: "ok", info }, 1000);
    const lost = nextFeed(ok, { status: "no-signal" }, 9000);
    expect(shownInfo(lost, 9000)).toEqual(info);
    expect(feedNote(lost, 9000)).toEqual({ noSignal: true, text: expect.stringMatching(/may be out of date/) });
  });

  it("never shows an old speed limit: blank after 10 s without an answer", () => {
    const ok = nextFeed(EMPTY_FEED, { status: "ok", info }, 1000);
    const lost = nextFeed(ok, { status: "no-signal" }, 1000 + STALE_MS + 1);
    expect(shownInfo(lost, 1000 + STALE_MS + 1)).toBeNull();
    expect(feedNote(lost, 1000 + STALE_MS + 1)?.text).toMatch(/show “—” until it’s back/);
  });

  it("clears the no-signal state once the server answers again", () => {
    const lost = nextFeed(EMPTY_FEED, { status: "no-signal" }, 1000);
    expect(nextFeed(lost, { status: "ok", info }, 2000).noSignal).toBe(false);
  });

  it("tells a build with no server apart from no signal", () => {
    const feed = nextFeed(EMPTY_FEED, { status: "unavailable" }, 1000);
    expect(feedNote(feed, 1000)).toEqual({
      noSignal: false,
      text: expect.stringMatching(/need the Blue Route server/),
    });
  });
});
