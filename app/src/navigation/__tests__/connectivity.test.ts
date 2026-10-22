import { describe, expect, it } from "vitest";

import { serverRequest } from "../../api/http";
import { routeFailure } from "../../api/routes";
import {
  linkBanner,
  mayAnnounceReroute,
  nextLink,
  ONLINE,
  onReconnect,
  wayBack,
  type LinkState,
} from "../connectivity";
import { offRouteText, rerouteFailure } from "../reroute";

// A fake server: the network fails (fetch rejects with a TypeError, as on a
// phone with no signal) until it's switched back on.
function fakeNetwork() {
  let up = false;
  const fetchFn = (async () => {
    if (!up) throw new TypeError("Network request failed");
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const request = () =>
    serverRequest("https://api.test/v1/route", {}, (r) => r.json(), { fetchFn, timeoutMs: 1000, uncounted: true }).then(
      () => ({ type: "answer" as const }),
      (err: unknown) => ({ type: "failed" as const, failure: rerouteFailure(routeFailure(err)) }),
    );
  return { request, setUp: (v: boolean) => (up = v) };
}

describe("navigation without signal", () => {
  it("goes online → no signal → off route offline → back online → re-route", async () => {
    const net = fakeNetwork();
    let s: LinkState = ONLINE;
    expect(linkBanner(s.link)).toBeNull();

    // Signal goes: the phone says so before any request fails.
    s = nextLink(s, { type: "network-down" });
    expect(linkBanner(s.link)).toBe("No signal: following the last route. Can't re-route.");

    // Off the line: the re-route can't be sent.
    s = nextLink(s, await net.request());
    expect(s).toEqual({ link: "no-signal", pending: true });
    expect(mayAnnounceReroute(s.link)).toBe(false);

    // Signal back: re-route at once (off route), banner stays until it answers.
    net.setUp(true);
    s = nextLink(s, { type: "network-up" });
    expect(onReconnect(s, true)).toBe("reroute");
    expect(s.link).toBe("no-signal");
    s = nextLink(s, await net.request());
    expect(s).toEqual(ONLINE);
    expect(linkBanner(s.link)).toBeNull();
  });

  it("refreshes quietly when signal returns on the line, if a refresh was owed", () => {
    let s = nextLink(ONLINE, { type: "failed", failure: "no-signal" });
    expect(onReconnect(s, false)).toBe("refresh");
    s = nextLink(ONLINE, { type: "network-down" });
    s = nextLink(s, { type: "network-up" });
    // Nothing owed: back online with no request.
    expect(s).toEqual(ONLINE);
    expect(onReconnect(s, false)).toBeNull();
  });

  it("never calls a slow server no signal", async () => {
    const fetchFn = (() => new Promise<Response>(() => {})) as typeof fetch;
    const failure = await serverRequest("https://api.test/x", {}, (r) => r.json(), {
      fetchFn,
      timeoutMs: 10,
      uncounted: true,
    }).then(
      () => null,
      (err: unknown) => rerouteFailure(routeFailure(err)),
    );
    expect(failure).toBe("no-answer");
    const s = nextLink(ONLINE, { type: "failed", failure });
    expect(linkBanner(s.link)).toBe("No answer from the server: following the last route.");
    expect(mayAnnounceReroute(s.link)).toBe(true);
    expect(offRouteText("no-answer", 10).detail).not.toMatch(/signal/i);
  });

  it("points the way back to the line and to the destination", () => {
    // A route running north–south; the car is 100 m east of it, facing north.
    const shape: [number, number][] = [
      [0, 51.5],
      [0, 51.51],
    ];
    const at = { lat: 51.505, lng: 100 / (111320 * Math.cos((51.505 * Math.PI) / 180)) };
    const back = wayBack(at, 0, shape, { lat: 51.51, lng: 0 });
    expect(back.toRouteM).toBeGreaterThan(95);
    expect(back.toRouteM).toBeLessThan(105);
    expect(back.toRouteTurn).toBe(-90); // left, to the west
    expect(back.toDestinationTurn).toBeLessThan(0);
    expect(back.toDestinationTurn).toBeGreaterThan(-90);
    expect(back.fromNorth).toBe(false);
    // Facing south, the line is to the right.
    expect(wayBack(at, 180, shape, { lat: 51.51, lng: 0 }).toRouteTurn).toBe(90);
  });
});
