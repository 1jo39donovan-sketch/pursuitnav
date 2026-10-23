// On-phone storage in SQLite. Nothing here leaves the phone.
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

import type { TripEvent, TripRecord } from "../fieldtest/trip";
import type { LogEntry, LoggedRoute, SavedPlace, Store } from "./types";

// Each entry upgrades the database by one version. Append; never edit.
const MIGRATIONS = [
  `CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
   CREATE TABLE places (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     road TEXT NOT NULL,
     borough TEXT NOT NULL,
     lat REAL NOT NULL,
     lng REAL NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,
  `CREATE TABLE log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     at TEXT NOT NULL,
     query TEXT NOT NULL,
     chosen TEXT NOT NULL,
     borough TEXT,
     lat REAL NOT NULL,
     lng REAL NOT NULL,
     route TEXT
   );
   CREATE INDEX log_at ON log (at);`,
  // Field-test trips: separate from the log, so Clear log leaves them alone.
  `CREATE TABLE trips (id TEXT PRIMARY KEY NOT NULL, started_at INTEGER NOT NULL, record TEXT NOT NULL);
   CREATE TABLE trip_events (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     trip_id TEXT NOT NULL,
     data TEXT NOT NULL
   );
   CREATE INDEX trip_events_trip ON trip_events (trip_id, seq);`,
];

function migrate(db: SQLiteDatabase) {
  const { user_version: version } = db.getFirstSync<{ user_version: number }>("PRAGMA user_version")!;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      db.execSync(MIGRATIONS[v]!);
      db.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

let db: SQLiteDatabase | null = null;
function open(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync("blueroute.db");
    db.execSync("PRAGMA journal_mode = WAL");
    migrate(db);
  }
  return db;
}

export const store: Store = {
  getSetting(key) {
    return open().getFirstSync<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)?.value ?? null;
  },
  setSetting(key, value) {
    open().runSync(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  },
  listPlaces() {
    return open().getAllSync<SavedPlace>("SELECT id, name, road, borough, lat, lng FROM places ORDER BY name");
  },
  addPlace(p) {
    const { lastInsertRowId } = open().runSync(
      "INSERT INTO places (name, road, borough, lat, lng) VALUES (?, ?, ?, ?, ?)",
      p.name,
      p.road,
      p.borough,
      p.lat,
      p.lng,
    );
    return { ...p, id: lastInsertRowId };
  },
  deletePlace(id) {
    open().runSync("DELETE FROM places WHERE id = ?", id);
  },
  addLogEntry(e) {
    const { lastInsertRowId } = open().runSync(
      "INSERT INTO log (at, query, chosen, borough, lat, lng) VALUES (?, ?, ?, ?, ?, ?)",
      e.at,
      e.query,
      e.chosen,
      e.borough,
      e.lat,
      e.lng,
    );
    return { ...e, id: lastInsertRowId, route: null };
  },
  setLogRoute(id, route: LoggedRoute) {
    open().runSync("UPDATE log SET route = ? WHERE id = ?", route, id);
  },
  listLog() {
    return open().getAllSync<LogEntry>(
      "SELECT id, at, query, chosen, borough, lat, lng, route FROM log ORDER BY at DESC, id DESC",
    );
  },
  clearLog() {
    open().runSync("DELETE FROM log");
  },
  saveTrip(r) {
    open().runSync(
      "INSERT INTO trips (id, started_at, record) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record",
      r.header.id,
      r.header.startedAt,
      JSON.stringify(r),
    );
  },
  addTripEvents(id, events) {
    const d = open();
    d.withTransactionSync(() => {
      for (const e of events) d.runSync("INSERT INTO trip_events (trip_id, data) VALUES (?, ?)", id, JSON.stringify(e));
    });
  },
  listTrips() {
    return open()
      .getAllSync<{ record: string }>("SELECT record FROM trips ORDER BY started_at DESC")
      .map((r) => JSON.parse(r.record) as TripRecord);
  },
  tripEvents(id) {
    return open()
      .getAllSync<{ data: string }>("SELECT data FROM trip_events WHERE trip_id = ? ORDER BY seq", id)
      .map((r) => JSON.parse(r.data) as TripEvent);
  },
  deleteTrips() {
    const d = open();
    d.withTransactionSync(() => {
      d.runSync("DELETE FROM trip_events");
      d.runSync("DELETE FROM trips");
    });
  },
  tripStorage() {
    const d = open();
    const trips = d.getFirstSync<{ n: number; b: number }>("SELECT count(*) AS n, coalesce(sum(length(record)), 0) AS b FROM trips")!;
    const events = d.getFirstSync<{ b: number }>("SELECT coalesce(sum(length(data)), 0) AS b FROM trip_events")!;
    return { trips: trips.n, bytes: trips.b + events.b };
  },
};
