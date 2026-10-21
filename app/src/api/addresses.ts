// Client for the server's POST /v1/addresses: postcodes, roads and places from
// OS Names, house numbers from OpenStreetMap, and (only where the server has
// a paid key) flats and named buildings from OS Places. Each answer says how
// exact it is.
import { API_URL } from "../config";
import { serverJson } from "./http";

export interface Address {
  /** Stable, e.g. "osm:W123", "os-names:…", "os-places:<UPRN>". Older servers sent only uprn. */
  id?: string;
  /** Older servers (OS Places only) didn't send it: door level. */
  precision?: "door" | "postcode" | "road" | "place";
  source?: "os-places" | "os-names" | "osm";
  uprn?: string;
  label: string;
  postcode: string;
  borough: string;
  lat: number;
  lng: number;
  match: number;
}

export type AddressLookup =
  | { status: "ok"; addresses: Address[] }
  /** No server, or the server has no address search set up: road-level search from the phone only. */
  | { status: "not-configured" }
  /** No signal or the service is down; offline search still works. */
  | { status: "unavailable" };

export async function fetchAddresses(query: string, signal?: AbortSignal): Promise<AddressLookup> {
  if (!API_URL) return { status: "not-configured" };
  try {
    const res = await serverJson<{ addresses?: Address[]; error?: string }>(`${API_URL}/v1/addresses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
      signal,
    });
    if (res.ok && res.body?.addresses) return { status: "ok", addresses: res.body.addresses };
    return res.body?.error === "addresses-not-configured" ? { status: "not-configured" } : { status: "unavailable" };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    return { status: "unavailable" };
  }
}
