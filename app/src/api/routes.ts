// Client for the server's POST /v1/routes. Types mirror server/src/plan.ts.
import type { LngLat } from "@maplibre/maplibre-react-native";

import { API_URL, DEMO_MODE } from "../config";
import type { RoadChoice } from "../session/SessionProvider";
import type { VehicleType } from "../vehicles";
import { noteRequest, serverDuration } from "../navigation/timings";
import { isNoAnswer, isNoSignal, QUICK_ROUTE_TIMEOUT_MS, ROUTE_TIMEOUT_MS, serverJson } from "./http";

export interface Maneuver {
  type: number;
  instruction: string;
  streetNames: string[];
  lengthM: number;
  timeS: number;
  beginShapeIndex: number;
  endShapeIndex: number;
}

export interface Route {
  durationS: number;
  distanceM: number;
  shape: LngLat[];
  maneuvers: Maneuver[];
  /** OpenStreetMap ways along the route by shape index, for timing roads (opt-in learning). */
  ways?: { wayId: number; beginShapeIndex: number; endShapeIndex: number }[];
  /** Serious TfL holdups the route goes through: there was no cheap way round. */
  delays?: TrafficDelay[];
  /** Serious TfL holdups it was routed round. */
  delaysAvoided?: TrafficDelay[];
}

/** A holdup TfL rates Serious or Severe (works, a collision, queues) on an open street. */
export interface TrafficDelay {
  street: string;
  severity: "Serious" | "Severe";
  /** TfL's latest update, e.g. "Southbound traffic is slow moving…". */
  update: string;
  location: { lat: number; lng: number };
}

export interface Restriction {
  kind: "turn" | "bus-only" | "manoeuvre" | "wrong-way";
  description: string;
  location: { lat: number; lng: number };
  /** Every place it applies (older servers don't send this: use location). */
  locations?: { lat: number; lng: number }[];
  streets: string[];
}

export interface PoliceRoute extends Route {
  savingS: number;
  restrictions: Restriction[];
  restrictionsComplete: boolean;
}

export type NoPoliceReason =
  | "not-faster"
  | "no-restrictions-found"
  | "wrong-way-unavoidable"
  | "vehicle-limit-unavoidable"
  | "not-declared"
  /** Only the standard route was asked for (blue-light routes off, or still being worked out). */
  | "not-checked"
  /** The blue-light check failed (no signal, server busy); the standard route stands. */
  | "check-failed";

/** The plan as shown to someone who hasn't confirmed they drive for an emergency service: standard only. */
export function withoutPolice(plan: RoutePlan): RoutePlan {
  return plan.police ? { ...plan, police: null, noPoliceReason: "not-declared" } : plan;
}

export interface RoutePlan {
  standard: Route;
  police: PoliceRoute | null;
  noPoliceReason?: NoPoliceReason;
  /** Live TfL full closures the routes keep clear of (absent if the server doesn't check). */
  closures?: { active: number; updatedAt?: string; ignored: boolean };
}

export class RouteError extends Error {}

/** The network failed: the request couldn't be sent at all. */
export class NoSignalRouteError extends RouteError {
  constructor() {
    super("No signal: can't reach the routing server. Check your signal and try again.");
  }
}

/** The request went but no route came back in time (30 s): the server is slow or unreachable. */
export class NoAnswerRouteError extends RouteError {
  constructor() {
    super("The routing server didn't answer in time. Try again.");
  }
}

/** The server answered, but with a fault of its own (it's down, restarting or broken), not a reason about the route. */
export class ServerDownRouteError extends RouteError {
  constructor() {
    super("BlueRoute's server isn't working right now.");
  }
}

/**
 * The requests for one plan: the standard route alone (back in a second or
 * so, shown first) and, with blue-light routes on, the full plan (slower).
 * Used for a plan asked for on the tap and one asked for before it alike.
 */
export function planRequests(
  from: { lat: number; lng: number; heading?: number },
  to: { lat: number; lng: number },
  opts: { vehicle: VehicleType; roads: RoadChoice; blueLight: boolean; signal: AbortSignal; prefetch?: boolean },
): { quick: Promise<RoutePlan>; full: Promise<RoutePlan> | null } {
  const { vehicle, roads, blueLight, signal, prefetch = false } = opts;
  const standard = () => fetchRoutes(from, to, vehicle, signal, true, roads, prefetch);
  return {
    // A lost request (no answer in 12 s) is asked once more: at most ~24 s, not
    // the blue-light check's 30 s (a favourite's route took 40 s to fail on 30 Oct).
    quick: standard().catch((err: unknown) => {
      if (err instanceof NoAnswerRouteError && !signal.aborted) return standard();
      throw err;
    }),
    full: blueLight ? fetchRoutes(from, to, vehicle, signal, false, roads, prefetch) : null,
  };
}

/** A failed request to the server as the route error to show. */
export function routeFailure(err: unknown): unknown {
  if (isNoSignal(err)) return new NoSignalRouteError();
  if (isNoAnswer(err)) return new NoAnswerRouteError();
  return err;
}

const MESSAGES: Record<string, string> = {
  "outside-area": "That's outside the area BlueRoute covers.",
  "no-route": "No route found to there.",
  "no-road-near": "No road found near there.",
  "routing-unavailable": "The routing server is having problems. Try again.",
  "no-safe-route": "No route found that avoids low bridges and weight limits for your vehicle.",
};

export async function fetchRoutes(
  /** heading: direction of travel when moving, so the route doesn't start with a U-turn. */
  from: { lat: number; lng: number; heading?: number },
  to: { lat: number; lng: number },
  /** Routes avoid limits this vehicle can't take. */
  vehicle: VehicleType,
  signal?: AbortSignal,
  /** Just the standard route: quick, for showing while the blue-light one is worked out. */
  standardOnly = false,
  roads: RoadChoice = "main",
  /** Asked for before the tap (the likely match): the server doesn't count it as a planned route. */
  prefetch = false,
): Promise<RoutePlan> {
  if (!API_URL) {
    throw new RouteError(
      DEMO_MODE
        ? "This demo has no routing server, so it can't work out routes. Search works fully."
        : "Routing server not set up in this build.",
    );
  }
  let res: { ok: boolean; status: number; body: unknown; serverTiming?: string | null };
  const asked = Date.now();
  try {
    res = await serverJson(
      `${API_URL}/v1/routes`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          vehicle,
          roads,
          ...(standardOnly ? { standardOnly } : {}),
          ...(prefetch ? { prefetch } : {}),
        }),
        signal,
      },
      { timeoutMs: standardOnly ? QUICK_ROUTE_TIMEOUT_MS : ROUTE_TIMEOUT_MS },
    );
  } catch (err) {
    throw routeFailure(err);
  }
  if (!prefetch) noteRequest(standardOnly, Date.now() - asked, serverDuration(res.serverTiming ?? null));
  if (!res.ok || !res.body) {
    const error = (res.body as { error?: string } | null)?.error ?? "";
    if (error === "routing-unavailable" || (res.status >= 500 && !MESSAGES[error])) throw new ServerDownRouteError();
    throw new RouteError(MESSAGES[error] ?? `Routing failed (${res.status}).`);
  }
  return res.body as RoutePlan;
}

/** Map points for a route's restrictions: one "R" per place. */
export function restrictionPoints(route: { restrictions: Restriction[] } | null | undefined): [number, number][] {
  return (route?.restrictions ?? []).flatMap((r) =>
    (r.locations?.length ? r.locations : [r.location]).map((p) => [p.lng, p.lat] as [number, number]),
  );
}
