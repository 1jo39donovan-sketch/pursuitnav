// Privacy-first usage counts: how many installs use Blue Route, and how much.
//
// Each app install sends a random ID (made on the phone, resettable there)
// and its version with every request. The server keeps:
//   - for today: a hash of each ID seen, salted with a salt made for today
//     only, and the app version, to count unique installs today;
//   - for this week: a hash of each ID seen, salted with a salt made for this
//     week only, to count unique installs this week. These hashes carry no
//     day, and today's carry no week link: the two can't be matched up;
//   - per day: plain counts (routes planned, navigation and pursuit sessions,
//     timeouts, errors).
// Once a day is over its unique total and version counts are saved, and that
// day's hashes and salt are deleted; the same for a week once it's over. A
// new salt each day (and week) means one install can't be linked from one
// day (or week) to the next. Nothing else is kept: no positions, no
// addresses, no searches, no IP addresses, and no count next to the request
// it came from.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** What's counted per day. */
export const METRICS = [
  "routes_planned",
  "navigation_sessions",
  "pursuit_sessions",
  "timeouts",
  "route_failures",
  "server_errors",
] as const;
export type Metric = (typeof METRICS)[number];

/** Events the app reports itself (the server can't see a session start). */
export const APP_EVENTS: Record<string, Metric> = {
  navigation: "navigation_sessions",
  pursuit: "pursuit_sessions",
  timeout: "timeouts",
};

/** An install ID as the app makes it: 32 hex characters. */
export const INSTALL_ID = /^[0-9a-f]{32}$/;
/** An app version, e.g. 1.0.0 or 1.2.0-beta.3. */
export const APP_VERSION = /^[0-9A-Za-z.+-]{1,32}$/;

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Monday of the (UTC) week the day is in, as yyyy-mm-dd. */
function weekOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return isoDay(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS);
}

export interface DayStats {
  day: string;
  installs: number;
  versions: Record<string, number>;
  counts: Record<Metric, number>;
}

export interface Stats {
  generatedAt: string;
  days: DayStats[];
  weeks: { week: string; installs: number }[];
}

export class UsageStore {
  private readonly db: DatabaseSync;

  constructor(
    file = ":memory:",
    private readonly now = () => Date.now(),
  ) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS salts (period TEXT NOT NULL, kind TEXT NOT NULL, salt TEXT NOT NULL,
                                        PRIMARY KEY (period, kind));
      CREATE TABLE IF NOT EXISTS seen_day (day TEXT NOT NULL, id TEXT NOT NULL, version TEXT NOT NULL,
                                           PRIMARY KEY (day, id));
      CREATE TABLE IF NOT EXISTS seen_week (week TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (week, id));
      CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, metric TEXT NOT NULL, n INTEGER NOT NULL,
                                         PRIMARY KEY (day, metric));
      CREATE TABLE IF NOT EXISTS uniques (period TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL,
                                          PRIMARY KEY (period, kind));
      CREATE TABLE IF NOT EXISTS versions (day TEXT NOT NULL, version TEXT NOT NULL, n INTEGER NOT NULL,
                                           PRIMARY KEY (day, version));
    `);
  }

  /** The salt for one day or one week, made the first time it's needed. It never leaves the server. */
  private salt(period: string, kind: "day" | "week"): string {
    const row = this.db.prepare("SELECT salt FROM salts WHERE period = ? AND kind = ?").get(period, kind) as
      | { salt: string }
      | undefined;
    if (row) return row.salt;
    const salt = randomBytes(32).toString("hex");
    this.db.prepare("INSERT INTO salts (period, kind, salt) VALUES (?, ?, ?)").run(period, kind, salt);
    return salt;
  }

  private hash(installId: string, period: string, kind: "day" | "week"): string {
    return createHash("sha256").update(this.salt(period, kind)).update(installId).digest("hex").slice(0, 32);
  }

  /** An install was active today. Ignores anything that isn't a well-formed ID. */
  seen(installId: string | undefined, version: string | undefined) {
    if (!installId || !INSTALL_ID.test(installId)) return;
    const v = version && APP_VERSION.test(version) ? version : "unknown";
    const day = isoDay(this.now());
    const week = weekOf(day);
    this.db
      .prepare("INSERT INTO seen_day (day, id, version) VALUES (?, ?, ?) ON CONFLICT (day, id) DO UPDATE SET version = ?")
      .run(day, this.hash(installId, day, "day"), v, v);
    this.db
      .prepare("INSERT INTO seen_week (week, id) VALUES (?, ?) ON CONFLICT (week, id) DO NOTHING")
      .run(week, this.hash(installId, week, "week"));
  }

  add(metric: Metric, n = 1) {
    if (n <= 0) return;
    this.db
      .prepare("INSERT INTO counts (day, metric, n) VALUES (?, ?, ?) ON CONFLICT (day, metric) DO UPDATE SET n = n + ?")
      .run(isoDay(this.now()), metric, n, n);
  }

  /**
   * For every day and week that's over: saves its unique-install total (and,
   * for a day, the count per app version), then deletes its hashes and its
   * salt. Run hourly and before /stats; safe to run any time.
   */
  rollup() {
    const today = isoDay(this.now());
    const thisWeek = weekOf(today);
    const days = this.db.prepare("SELECT DISTINCT day FROM seen_day WHERE day < ?").all(today) as { day: string }[];
    for (const { day } of days) {
      this.db.exec("BEGIN");
      const versions = this.db
        .prepare("SELECT version, COUNT(*) AS n FROM seen_day WHERE day = ? GROUP BY version")
        .all(day) as { version: string; n: number }[];
      const total = versions.reduce((a, r) => a + r.n, 0);
      this.db
        .prepare("INSERT INTO uniques (period, kind, n) VALUES (?, 'day', ?) ON CONFLICT DO UPDATE SET n = excluded.n")
        .run(day, total);
      for (const r of versions) {
        this.db
          .prepare("INSERT INTO versions (day, version, n) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET n = excluded.n")
          .run(day, r.version, r.n);
      }
      this.db.prepare("DELETE FROM seen_day WHERE day = ?").run(day);
      this.db.exec("COMMIT");
    }
    const weeks = this.db.prepare("SELECT week, COUNT(*) AS n FROM seen_week WHERE week < ? GROUP BY week").all(
      thisWeek,
    ) as { week: string; n: number }[];
    for (const { week, n } of weeks) {
      this.db.exec("BEGIN");
      this.db
        .prepare("INSERT INTO uniques (period, kind, n) VALUES (?, 'week', ?) ON CONFLICT DO UPDATE SET n = excluded.n")
        .run(week, n);
      this.db.prepare("DELETE FROM seen_week WHERE week = ?").run(week);
      this.db.exec("COMMIT");
    }
    // Salts of days and weeks that are over go too (including any that saw no installs).
    this.db
      .prepare("DELETE FROM salts WHERE (kind = 'day' AND period < ?) OR (kind = 'week' AND period < ?)")
      .run(today, thisWeek);
  }

  /** Counts for the last `days` days (today included), newest first, and the weeks they fall in. */
  stats(days = 30): Stats {
    this.rollup();
    const now = this.now();
    const today = isoDay(now);
    const out: DayStats[] = [];
    for (let i = 0; i < days; i++) {
      const day = isoDay(now - i * DAY_MS);
      const versions: Record<string, number> = {};
      const rows =
        day === today
          ? (this.db.prepare("SELECT version, COUNT(*) AS n FROM seen_day WHERE day = ? GROUP BY version").all(day) as {
              version: string;
              n: number;
            }[])
          : (this.db.prepare("SELECT version, n FROM versions WHERE day = ?").all(day) as {
              version: string;
              n: number;
            }[]);
      for (const r of rows) versions[r.version] = r.n;
      const counts = Object.fromEntries(METRICS.map((m) => [m, 0])) as Record<Metric, number>;
      for (const r of this.db.prepare("SELECT metric, n FROM counts WHERE day = ?").all(day) as {
        metric: Metric;
        n: number;
      }[]) {
        if (r.metric in counts) counts[r.metric] = r.n;
      }
      out.push({ day, installs: Object.values(versions).reduce((a, b) => a + b, 0), versions, counts });
    }
    const weeks = [...new Set(out.map((d) => weekOf(d.day)))].map((week) => {
      const kept = this.db.prepare("SELECT n FROM uniques WHERE period = ? AND kind = 'week'").get(week) as
        | { n: number }
        | undefined;
      const live = this.db.prepare("SELECT COUNT(*) AS n FROM seen_week WHERE week = ?").get(week) as { n: number };
      return { week, installs: kept?.n ?? live.n };
    });
    return { generatedAt: new Date(now).toISOString(), days: out, weeks };
  }

  /** Only for tests: the hashes and salts held. */
  held(): { dayHashes: number; weekHashes: number; salts: number } {
    const n = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    return {
      dayHashes: n("SELECT COUNT(*) AS n FROM seen_day"),
      weekHashes: n("SELECT COUNT(*) AS n FROM seen_week"),
      salts: n("SELECT COUNT(*) AS n FROM salts"),
    };
  }

  /** Only for tests: the stored day hashes. */
  dayHashes(): string[] {
    return (this.db.prepare("SELECT id FROM seen_day").all() as { id: string }[]).map((r) => r.id);
  }

  close() {
    this.db.close();
  }
}
