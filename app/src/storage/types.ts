import type { Borough } from "../search/boroughs";

export interface SavedPlace {
  id: number;
  name: string;
  road: string;
  borough: Borough;
  lat: number;
  lng: number;
}

/** How the officer went: in-app route, or handed to another app. */
export type LoggedRoute = "standard" | "police" | "google-maps" | "waze";

/** One search and what came of it. Kept until the officer clears the log. */
export interface LogEntry {
  id: number;
  /** ISO time the destination was picked. */
  at: string;
  /** What was typed, as typed ("" for a map press or marker). */
  query: string;
  /** The address or place chosen. */
  chosen: string;
  borough: string | null;
  lat: number;
  lng: number;
  route: LoggedRoute | null;
}

/** Everything the app keeps on the phone. Never synced anywhere. */
export interface Store {
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
  listPlaces(): SavedPlace[];
  addPlace(place: Omit<SavedPlace, "id">): SavedPlace;
  deletePlace(id: number): void;
  addLogEntry(entry: Omit<LogEntry, "id" | "route">): LogEntry;
  /** Records the route picked for an entry (the latest pick wins). */
  setLogRoute(id: number, route: LoggedRoute): void;
  /** Newest first. */
  listLog(): LogEntry[];
  clearLog(): void;
}
