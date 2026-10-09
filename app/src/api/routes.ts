// Client for the server's POST /v1/routes. Types mirror server/src/plan.ts.
import type { LngLat } from "@maplibre/maplibre-react-native";

import { API_URL, DEMO_MODE } from "../config";

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
}

export interface Restriction {
  kind: "turn" | "bus-only" | "manoeuvre" | "wrong-way";
  description: string;
  location: { lat: number; lng: number };
  streets: string[];
}

export interface PoliceRoute extends Route {
  savingS: number;
  restrictions: Restriction[];
  restrictionsComplete: boolean;
}

export type NoPoliceReason = "not-faster" | "no-restrictions-found" | "wrong-way-unavoidable";

export interface RoutePlan {
  standard: Route;
  police: PoliceRoute | null;
  noPoliceReason?: NoPoliceReason;
}

export class RouteError extends Error {}

const MESSAGES: Record<string, string> = {
  "outside-area": "That's outside the area Blue Route covers.",
  "no-route": "No route found to there.",
  "no-road-near": "No road found near there.",
  "routing-unavailable": "The routing server is having problems. Try again.",
};

export async function fetchRoutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<RoutePlan> {
  if (!API_URL) {
    throw new RouteError(
      DEMO_MODE
        ? "This demo has no routing server, so it can't work out routes. Search works fully."
        : "Routing server not set up in this build.",
    );
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/routes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from, to }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new RouteError("Can't reach the routing server. Check your signal.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new RouteError(MESSAGES[body.error ?? ""] ?? `Routing failed (${res.status}).`);
  }
  return (await res.json()) as RoutePlan;
}
