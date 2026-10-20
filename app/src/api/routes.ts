// Client for the server's POST /v1/routes. Types mirror server/src/plan.ts.
import type { LngLat } from "@maplibre/maplibre-react-native";

import { API_URL, DEMO_MODE } from "../config";
import type { RoadChoice } from "../session/SessionProvider";
import type { VehicleType } from "../vehicles";
import { isNoAnswer, isNoSignal, ROUTE_TIMEOUT_MS, serverJson } from "./http";

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

/** A failed request to the server as the route error to show. */
export function routeFailure(err: unknown): unknown {
  if (isNoSignal(err)) return new NoSignalRouteError();
  if (isNoAnswer(err)) return new NoAnswerRouteError();
  return err;
}

const MESSAGES: Record<string, string> = {
  "outside-area": "That's outside the area Blue Route covers.",
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
): Promise<RoutePlan> {
  if (!API_URL) {
    throw new RouteError(
      DEMO_MODE
        ? "This demo has no routing server, so it can't work out routes. Search works fully."
        : "Routing server not set up in this build.",
    );
  }
  let res: { ok: boolean; status: number; body: unknown };
  try {
    res = await serverJson(
      `${API_URL}/v1/routes`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from, to, vehicle, roads, ...(standardOnly ? { standardOnly } : {}) }),
        signal,
      },
      { timeoutMs: ROUTE_TIMEOUT_MS },
    );
  } catch (err) {
    throw routeFailure(err);
  }
  if (!res.ok || !res.body) {
    const error = (res.body as { error?: string } | null)?.error ?? "";
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
