// Client for the server's POST /v1/pursuit.
import { API_URL } from "../config";
import { isNoSignal, serverJson } from "./http";

export interface PursuitInfo {
  road: string | null;
  /** Signed limit from OSM; null when the road has none tagged. Never guessed. */
  speedLimitMph: number | null;
  nextJunction: { name: string; distanceM: number } | null;
}

export type PursuitLookup =
  | { status: "ok"; info: PursuitInfo }
  /** No answer within the timeout: no signal, or the server is down. */
  | { status: "no-signal" }
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
    return isNoSignal(err) ? { status: "no-signal" } : { status: "unavailable" };
  }
}
