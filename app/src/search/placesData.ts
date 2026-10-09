// Keeps a copy of the server's places file on the phone, so place search
// works with no signal, and checks for the weekly update.
import { File, Paths } from "expo-file-system";

import { API_URL } from "../config";
import { store } from "../storage/store";

const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;
const cached = () => new File(Paths.document, "places.txt");

/** The places file kept from last time, or null on first run. */
export async function loadCachedPlaces(): Promise<string | null> {
  const file = cached();
  return file.exists ? file.text() : null;
}

/**
 * Fetches a newer places file if the server has one. Returns its text, or
 * null when there's nothing new (or no signal; the cached copy stays).
 */
export async function fetchNewerPlaces(force = false): Promise<string | null> {
  if (!API_URL) return null;
  const lastCheck = Number(store.getSetting("placesCheckedAt") ?? 0);
  const haveCopy = cached().exists;
  if (!force && haveCopy && Date.now() - lastCheck < CHECK_EVERY_MS) return null;
  try {
    const etag = haveCopy ? store.getSetting("placesEtag") : null;
    const res = await fetch(`${API_URL}/v1/places-data`, { headers: etag ? { "if-none-match": etag } : {} });
    store.setSetting("placesCheckedAt", String(Date.now()));
    if (res.status !== 200) return null;
    const text = await res.text();
    if (!text.startsWith("#blueroute-places")) return null;
    cached().write(text);
    const newEtag = res.headers.get("etag");
    if (newEtag) store.setSetting("placesEtag", newEtag);
    return text;
  } catch {
    return null;
  }
}
