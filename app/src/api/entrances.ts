// Client for the server's POST /v1/entrances: the ways into buildings by a
// door the crew picked. Empty with no signal, no server or no answer in time:
// the route then goes to the door's point, as before.
import { API_URL } from "../config";
import { serverJson } from "./http";

export interface Entrance {
  lat: number;
  lng: number;
  kind: string;
  ref: string;
  name: string;
  housenumber: string;
  street: string;
  flats: string;
  metres: number;
}

/** Entrances near a point; [] after `waitMs`, so a slow answer never holds up the route. */
export async function fetchEntrances(lat: number, lng: number, waitMs = 1200): Promise<Entrance[]> {
  if (!API_URL) return [];
  const ask = serverJson<{ entrances: Entrance[] }>(`${API_URL}/v1/entrances`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  })
    .then((res) => (res.ok && Array.isArray(res.body?.entrances) ? res.body.entrances : []))
    .catch(() => []);
  const late = new Promise<Entrance[]>((done) => setTimeout(() => done([]), waitMs));
  return Promise.race([ask, late]);
}
