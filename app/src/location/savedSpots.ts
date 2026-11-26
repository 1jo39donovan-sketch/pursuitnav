// Saved spots: "Save this spot" on Where am I keeps where the officer was,
// and when, so it can go in their notes later (an arrest, say). The last
// five, newest first, on this phone only: never sent anywhere unless the
// officer shares one.
import type { Store } from "../storage/types";
import type { WhereDetails } from "./whereDetails";

export const SAVED_SPOTS_MAX = 5;
const KEY = "savedSpots";

export interface SavedSpot extends WhereDetails {
  /** When Save was pressed (`at` is the GPS fix's own time). */
  savedAt: number;
}

/** The list with this spot added at the front, keeping the newest five. */
export function addSpot(list: readonly SavedSpot[], spot: SavedSpot): SavedSpot[] {
  return [spot, ...list].slice(0, SAVED_SPOTS_MAX);
}

export function loadSpots(store: Pick<Store, "getSetting">): SavedSpot[] {
  try {
    const raw = JSON.parse(store.getSetting(KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (s): s is SavedSpot =>
          !!s &&
          typeof s === "object" &&
          typeof s.savedAt === "number" &&
          typeof s.latLng === "string" &&
          typeof s.at === "number",
      )
      .slice(0, SAVED_SPOTS_MAX);
  } catch {
    return [];
  }
}

export function saveSpots(store: Pick<Store, "setSetting">, list: readonly SavedSpot[]): void {
  try {
    store.setSetting(KEY, JSON.stringify(list.slice(0, SAVED_SPOTS_MAX)));
  } catch {
    // Storage blocked: kept for this visit only.
  }
}

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/** "Thu 26 Nov, 14:05:12": when it was saved, for the list and for notes. */
export function savedWhen(spot: SavedSpot): string {
  return when(spot.savedAt);
}

/** The spot as text, with the date, to paste into notes or a message. */
export function spotText(spot: SavedSpot): string {
  return [
    `Saved location (BlueRoute), ${when(spot.savedAt)}`,
    [spot.address, spot.postcode, spot.borough].filter(Boolean).join(", ") || null,
    spot.grid ? `OS grid ${spot.grid}` : null,
    `${spot.latLng} (±${spot.accuracyM ?? "?"} m, GPS at ${new Date(spot.at).toLocaleTimeString("en-GB")})`,
    `https://maps.google.com/?q=${spot.latLng.replace(" ", "")}`,
  ]
    .filter(Boolean)
    .join("\n");
}
