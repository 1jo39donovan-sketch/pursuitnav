// On-phone storage in SQLite. Nothing here leaves the phone.
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

import type { SavedPlace, Store } from "./types";

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
};
