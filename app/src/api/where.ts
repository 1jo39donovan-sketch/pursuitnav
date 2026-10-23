// Client for the server's POST /v1/where: the address at the officer's
// position, for "Where am I". Null with no signal or no server: the panel
// then shows what the phone can work out by itself.
import { API_URL } from "../config";
import { serverJson } from "./http";

export interface WhereAnswer {
  /** The nearest mapped house number, "123 Maida Vale"; null if none is close. */
  door: string | null;
  road: string | null;
  postcode: string | null;
}

export async function fetchWhere(lat: number, lng: number): Promise<WhereAnswer | null> {
  if (!API_URL) return null;
  try {
    const res = await serverJson<WhereAnswer>(`${API_URL}/v1/where`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    return res.ok ? res.body : null;
  } catch {
    return null;
  }
}
