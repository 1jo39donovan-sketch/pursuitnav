// Browser preview: the same store in localStorage. SQLite in the browser
// needs cross-origin isolation headers that preview pages can't count on.
import type { TripEvent, TripRecord } from "../fieldtest/trip";
import type { LogEntry, SavedPlace, Store } from "./types";

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

const memory = {
  settings: read<Record<string, string>>("settings", {}),
  places: read<SavedPlace[]>("places", []),
  log: read<LogEntry[]>("log", []),
  trips: read<TripRecord[]>("trips", []),
};
// Each trip's events under their own key, read only when asked for.
const eventsKey = (id: string) => `trip-events:${id}`;

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
  addLogEntry(e) {
    const entry: LogEntry = { ...e, id: Math.max(0, ...memory.log.map((x) => x.id)) + 1, route: null };
    memory.log.push(entry);
    write("log", memory.log);
    return entry;
  },
  setLogRoute(id, route) {
    memory.log = memory.log.map((e) => (e.id === id ? { ...e, route } : e));
    write("log", memory.log);
  },
  listLog: () => [...memory.log].sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id),
  clearLog() {
    memory.log = [];
    write("log", memory.log);
  },
  saveTrip(r) {
    memory.trips = [...memory.trips.filter((t) => t.header.id !== r.header.id), r];
    write("trips", memory.trips);
  },
  addTripEvents(id, events) {
    write(eventsKey(id), [...read<TripEvent[]>(eventsKey(id), []), ...events]);
  },
  listTrips: () => [...memory.trips].sort((a, b) => b.header.startedAt - a.header.startedAt),
  tripEvents: (id) => read<TripEvent[]>(eventsKey(id), []),
  deleteTrips() {
    for (const t of memory.trips) {
      try {
        localStorage.removeItem(PREFIX + eventsKey(t.header.id));
      } catch {
        // Blocked: nothing to remove.
      }
    }
    memory.trips = [];
    write("trips", memory.trips);
  },
  tripStorage() {
    let bytes = 0;
    for (const t of memory.trips) {
      try {
        bytes += (localStorage.getItem(PREFIX + eventsKey(t.header.id)) ?? "").length;
      } catch {
        // Blocked: counted as empty.
      }
      bytes += JSON.stringify(t).length;
    }
    return { trips: memory.trips.length, bytes };
  },
};
