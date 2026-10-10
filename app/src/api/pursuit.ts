// Client for the server's POST /v1/pursuit.
import { API_URL } from "../config";

export interface PursuitInfo {
  road: string | null;
  /** Signed limit from OSM; null when the road has none tagged. Never guessed. */
  speedLimitMph: number | null;
  nextJunction: { name: string; distanceM: number } | null;
}

export async function fetchPursuitInfo(
  points: { lat: number; lng: number }[],
  heading: number | undefined,
  signal?: AbortSignal,
): Promise<PursuitInfo | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}/v1/pursuit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(heading === undefined ? { points } : { points, heading }),
      signal,
    });
    return res.ok ? ((await res.json()) as PursuitInfo) : null;
  } catch {
    return null;
  }
}
