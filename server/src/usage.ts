// Privacy-first usage counts: how many installs use Blue Route, and how much.
//
// Each app install sends a random ID (made on the phone, resettable there)
// and its version with every request. The server keeps:
//   - per day: a salted hash of each ID seen, and the app version, so unique
//     installs per day and per week can be counted. These are deleted after
//     30 days, once the day's and week's totals have been kept;
//   - per day: plain counts (routes planned, navigation and pursuit sessions,
//     timeouts, errors).
// Nothing else: no positions, no addresses, no searches, no IP addresses. A
// count is never stored next to the request it came from.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const KEEP_IDS_DAYS = 30;

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
  private readonly salt: string;

  constructor(
    file = ":memory:",
    private readonly now = () => Date.now(),
  ) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seen (day TEXT NOT NULL, id TEXT NOT NULL, version TEXT NOT NULL,
                                       PRIMARY KEY (day, id));
      CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, metric TEXT NOT NULL, n INTEGER NOT NULL,
                                         PRIMARY KEY (day, metric));
      CREATE TABLE IF NOT EXISTS uniques (period TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL,
                                          PRIMARY KEY (period, kind));
    `);
    // A salt that never leaves the server, so the stored hashes can't be
    // matched to IDs from phones even by someone holding the database.
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'salt'").get() as { value: string } | undefined;
    this.salt = row?.value ?? randomBytes(32).toString("hex");
    if (!row) this.db.prepare("INSERT INTO meta (key, value) VALUES ('salt', ?)").run(this.salt);
  }

  /** An install was active today. Ignores anything that isn't a well-formed ID. */
  seen(installId: string | undefined, version: string | undefined) {
    if (!installId || !INSTALL_ID.test(installId)) return;
    const v = version && APP_VERSION.test(version) ? version : "unknown";
    const id = createHash("sha256").update(this.salt).update(installId).digest("hex").slice(0, 32);
    this.db
      .prepare("INSERT INTO seen (day, id, version) VALUES (?, ?, ?) ON CONFLICT (day, id) DO UPDATE SET version = ?")
      .run(isoDay(this.now()), id, v, v);
  }

  add(metric: Metric, n = 1) {
    if (n <= 0) return;
    this.db
      .prepare("INSERT INTO counts (day, metric, n) VALUES (?, ?, ?) ON CONFLICT (day, metric) DO UPDATE SET n = n + ?")
      .run(isoDay(this.now()), metric, n, n);
  }

  /**
   * Keeps the unique-install totals of every finished day and week, then
   * deletes the hashed IDs older than KEEP_IDS_DAYS. Safe to run any time.
   */
  rollup() {
    const today = isoDay(this.now());
    const thisWeek = weekOf(today);
    const keep = (period: string, kind: "day" | "week", n: number) =>
      this.db
        .prepare("INSERT INTO uniques (period, kind, n) VALUES (?, ?, ?) ON CONFLICT (period, kind) DO NOTHING")
        .run(period, kind, n);
    const days = this.db.prepare("SELECT day, COUNT(*) AS n FROM seen WHERE day < ? GROUP BY day").all(today) as {
      day: string;
      n: number;
    }[];
    for (const { day, n } of days) keep(day, "day", n);
    const weeks = new Map<string, Set<string>>();
    for (const r of this.db.prepare("SELECT day, id FROM seen").all() as { day: string; id: string }[]) {
      const w = weekOf(r.day);
      if (w < thisWeek) weeks.set(w, (weeks.get(w) ?? new Set()).add(r.id));
    }
    for (const [week, ids] of weeks) keep(week, "week", ids.size);
    // The totals above are kept; the hashed IDs go after 30 days.
    this.db.prepare("DELETE FROM seen WHERE day < ?").run(isoDay(this.now() - KEEP_IDS_DAYS * DAY_MS));
  }

  /** Counts for the last `days` days (today included), newest first, and the weeks they fall in. */
  stats(days = 30): Stats {
    this.rollup();
    const now = this.now();
    const out: DayStats[] = [];
    for (let i = 0; i < days; i++) {
      const day = isoDay(now - i * DAY_MS);
      const kept = this.db.prepare("SELECT n FROM uniques WHERE period = ? AND kind = 'day'").get(day) as
        | { n: number }
        | undefined;
      const versions: Record<string, number> = {};
      for (const r of this.db
        .prepare("SELECT version, COUNT(*) AS n FROM seen WHERE day = ? GROUP BY version")
        .all(day) as { version: string; n: number }[]) {
        versions[r.version] = r.n;
      }
      const live = Object.values(versions).reduce((a, b) => a + b, 0);
      const counts = Object.fromEntries(METRICS.map((m) => [m, 0])) as Record<Metric, number>;
      for (const r of this.db.prepare("SELECT metric, n FROM counts WHERE day = ?").all(day) as {
        metric: Metric;
        n: number;
      }[]) {
        if (r.metric in counts) counts[r.metric] = r.n;
      }
      out.push({ day, installs: kept?.n ?? live, versions, counts });
    }
    const weekSet = [...new Set(out.map((d) => weekOf(d.day)))];
    const weeks = weekSet.map((week) => {
      const kept = this.db.prepare("SELECT n FROM uniques WHERE period = ? AND kind = 'week'").get(week) as
        | { n: number }
        | undefined;
      if (kept) return { week, installs: kept.n };
      const live = this.db
        .prepare("SELECT COUNT(DISTINCT id) AS n FROM seen WHERE day >= ? AND day < ?")
        .get(week, isoDay(Date.parse(`${week}T00:00:00Z`) + 7 * DAY_MS)) as { n: number };
      return { week, installs: live.n };
    });
    return { generatedAt: new Date(now).toISOString(), days: out, weeks };
  }

  /** Only for tests: how many hashed IDs are held. */
  heldIds(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM seen").get() as { n: number }).n;
  }

  close() {
    this.db.close();
  }
}
