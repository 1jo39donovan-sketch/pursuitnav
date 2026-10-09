// Browser preview: the same store in localStorage. SQLite in the browser
// needs cross-origin isolation headers that preview pages can't count on.
import type { SavedPlace, Store } from "./types";

const PREFIX = "blueroute:";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage blocked (private window): keep working for this visit.
  }
}

const memory = { settings: read<Record<string, string>>("settings", {}), places: read<SavedPlace[]>("places", []) };

export const store: Store = {
  getSetting: (key) => memory.settings[key] ?? null,
  setSetting(key, value) {
    memory.settings[key] = value;
    write("settings", memory.settings);
  },
  listPlaces: () => [...memory.places].sort((a, b) => a.name.localeCompare(b.name)),
  addPlace(p) {
    const place = { ...p, id: Math.max(0, ...memory.places.map((x) => x.id)) + 1 };
    memory.places.push(place);
    write("places", memory.places);
    return place;
  },
  deletePlace(id) {
    memory.places = memory.places.filter((p) => p.id !== id);
    write("places", memory.places);
  },
};
