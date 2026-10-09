// Browser preview: no file cache, just fetch the places file when there's a server.
import { API_URL } from "../config";

export async function loadCachedPlaces(): Promise<string | null> {
  return null;
}

export async function fetchNewerPlaces(): Promise<string | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}/v1/places-data`);
    if (!res.ok) return null;
    const text = await res.text();
    return text.startsWith("#blueroute-places") ? text : null;
  } catch {
    return null;
  }
}
