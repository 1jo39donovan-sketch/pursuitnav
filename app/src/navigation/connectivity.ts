// Navigation with and without signal. Guidance never needs the network: the
// route is on the phone and progress comes from GPS. Only a new route does.
// So with no signal, navigation carries on along the last route and says so,
// and the moment signal is back it does what it couldn't: a re-route if off
// the line, otherwise the refresh that failed, quietly.
//
// What's known about the link comes from two places: the phone's own network
// state (expo-network), and how the last request to the server went. They're
// kept apart from a slow server: "no answer" means the request went and the
// server didn't reply in time; "no signal" means it couldn't be sent at all.
import type { RerouteFailure } from "./reroute";

export type Link = "online" | "no-signal" | "no-answer";

export interface LinkState {
  link: Link;
  /** A request that failed for want of signal, to make again when it's back. */
  pending: boolean;
}

export const ONLINE: LinkState = { link: "online", pending: false };

export type LinkEvent =
  /** The phone's network went away (airplane mode, no bars). */
  | { type: "network-down" }
  /** The phone has a network again. */
  | { type: "network-up" }
  /** A request to the server came back. */
  | { type: "answer" }
  /** A request to the server failed. */
  | { type: "failed"; failure: RerouteFailure };

export function nextLink(state: LinkState, event: LinkEvent): LinkState {
  switch (event.type) {
    case "network-down":
      return { ...state, link: "no-signal" };
    case "network-up":
      // Still "no signal" until the server answers, if something is owed:
      // the banner clears on an answer, not on a bar of signal.
      return state.pending ? state : { link: "online", pending: false };
    case "answer":
      return ONLINE;
    case "failed":
      if (event.failure === "no-signal") return { link: "no-signal", pending: true };
      if (event.failure === "no-answer") return { link: "no-answer", pending: true };
      return { ...state, pending: true };
  }
}

/** What to do when the network comes back. */
export function onReconnect(state: LinkState, offRoute: boolean): "reroute" | "refresh" | null {
  if (offRoute) return "reroute";
  return state.pending ? "refresh" : null;
}

/** The persistent banner over the map, or null when all's well. */
export function linkBanner(link: Link): string | null {
  if (link === "no-signal") return "No signal: following the last route. Can't re-route.";
  if (link === "no-answer") return "No answer from the server: following the last route.";
  return null;
}

/** Picking a destination with no signal: said on the route card, with the hand-offs and Retry. */
export const NO_SIGNAL_ROUTE_START = "No signal: can't plan a route. Open in Google Maps / Waze, or try again.";
/** Picking a destination while the server is down or not answering: the hand-off comes first. */
export const SERVER_DOWN_ROUTE_START = "BlueRoute's server isn't answering. Use Google Maps or Waze for now, or try again.";
/** No answer in time: weak signal or a busy server, so it doesn't say the server is down. */
export const NO_ANSWER_ROUTE_START =
  "No answer from the BlueRoute server in time (weak signal, or the server is busy). Use Google Maps or Waze for now, or try again.";
export const RETRYING_WHEN_BACK = "Trying again by itself when signal is back.";

/** "Re-routing" is only said when a re-route can actually happen. */
export function mayAnnounceReroute(link: Link): boolean {
  return link !== "no-signal";
}

/** Off route with no signal: the way back to the line, and to the destination. */
export interface WayBack {
  /** Metres to the nearest point of the route. */
  toRouteM: number;
  /** Degrees to turn from the way the vehicle faces (or from north, if that's unknown), -180..180. */
  toRouteTurn: number;
  toDestinationM: number;
  toDestinationTurn: number;
  /** True when the turns are from north, not from the way the vehicle faces. */
  fromNorth: boolean;
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const turn = (bearing: number, facing: number | null) => {
  const t = (((bearing - (facing ?? 0)) % 360) + 540) % 360 - 180;
  return Math.round(t);
};

/** The nearest point of a route shape ([lng, lat]) to a position, on its segments. */
export function nearestOnShape(
  at: { lat: number; lng: number },
  shape: readonly (readonly [number, number])[],
): { lat: number; lng: number } {
  const cos = Math.cos(rad(at.lat));
  let best = { lat: shape[0]![1], lng: shape[0]![0] };
  let bestD = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i]!;
    const b = shape[Math.min(i + 1, shape.length - 1)]!;
    // Flat projection: fine over the few hundred metres that matter here.
    const ax = (a[0] - at.lng) * cos;
    const ay = a[1] - at.lat;
    const bx = (b[0] - at.lng) * cos;
    const by = b[1] - at.lat;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const d = px * px + py * py;
    if (d < bestD) {
      bestD = d;
      best = { lng: at.lng + px / cos, lat: at.lat + py };
    }
  }
  return best;
}

export function wayBack(
  at: { lat: number; lng: number },
  facing: number | null,
  shape: readonly (readonly [number, number])[],
  destination: { lat: number; lng: number },
): WayBack {
  const near = nearestOnShape(at, shape);
  return {
    toRouteM: distanceM(at, near),
    toRouteTurn: turn(bearingDeg(at, near), facing),
    toDestinationM: distanceM(at, destination),
    toDestinationTurn: turn(bearingDeg(at, destination), facing),
    fromNorth: facing == null,
  };
}
