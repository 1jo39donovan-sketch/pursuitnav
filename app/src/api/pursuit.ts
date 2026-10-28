// Client for the server's POST /v1/pursuit.
import { API_URL } from "../config";
import { isNoAnswer, isNoSignal, serverJson } from "./http";

export interface PursuitInfo {
  road: string | null;
  /** Signed limit from OSM; null when the road has none tagged. Never guessed. */
  speedLimitMph: number | null;
  nextJunction: { name: string; distanceM: number } | null;
  /** The mapped house number by the car ("123 Maida Vale"); null when none is close. Older servers leave it out. */
  near?: string | null;
  /** The stretch of road the car is on, [lng, lat] in its direction: the arrow is drawn on it. Older servers leave it out. */
  roadShape?: [number, number][] | null;
}

export type PursuitLookup =
  | { status: "ok"; info: PursuitInfo }
  /** The network failed. */
  | { status: "no-signal" }
  /** Sent, but no answer within the timeout: the server is slow or unreachable. */
  | { status: "no-answer" }
  /** No server in this build, or it answered with an error. */
  | { status: "unavailable" };

export async function fetchPursuitInfo(
  points: { lat: number; lng: number }[],
  heading: number | undefined,
  signal?: AbortSignal,
): Promise<PursuitLookup> {
  if (!API_URL) return { status: "unavailable" };
  try {
    const res = await serverJson<PursuitInfo>(`${API_URL}/v1/pursuit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(heading === undefined ? { points } : { points, heading }),
      signal,
    });
    return res.ok && res.body ? { status: "ok", info: res.body } : { status: "unavailable" };
  } catch (err) {
    if (isNoSignal(err)) return { status: "no-signal" };
    return isNoAnswer(err) ? { status: "no-answer" } : { status: "unavailable" };
  }
}
