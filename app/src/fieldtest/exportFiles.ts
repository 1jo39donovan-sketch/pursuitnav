// Field trips as files for a spreadsheet and a map viewer: trips.csv (one
// row a trip), events.csv (one row an event) and GPX 1.1 (the track, marks
// as waypoints). CSV quoting follows RFC 4180.
import { MARKS, type TripEvent, type TripRecord } from "./trip";

/** One CSV field: quoted when it holds a comma, quote or line break, quotes doubled. */
export function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

const iso = (t: number | null) => (t === null ? "" : new Date(t).toISOString());

export const TRIP_COLUMNS = [
  "trip_id",
  "demo",
  "started",
  "app_version",
  "platform",
  "vehicle",
  "blue_light_setting",
  "query",
  "destination",
  "dest_lat",
  "dest_lng",
  "gps_accuracy_m",
  "standard_route_ms",
  "full_plan_ms",
  "standard_eta_s",
  "standard_m",
  "blue_light_eta_s",
  "blue_light_m",
  "blue_light_restrictions",
  "fastest",
  "route_followed",
  "stale_refresh_at_go",
  "go",
  "ended",
  "end_reason",
  "duration_s",
  "driven_m",
  "first_eta_s",
  "eta_error_s",
  "reroutes",
  "off_routes",
  "marks",
  "taps_ignored",
  "no_signal_s",
  "no_answer_s",
  "google_apple_eta_min",
];

export function tripsCsv(trips: readonly TripRecord[]): string {
  return csv([
    TRIP_COLUMNS,
    ...trips.map(({ header: h, summary: s, others }) => [
      h.id,
      h.demo ? "yes" : "no",
      iso(h.startedAt),
      h.appVersion,
      h.platform,
      h.vehicle,
      h.blueLight ? "on" : "off",
      h.query,
      h.destination.title,
      h.destination.lat.toFixed(6),
      h.destination.lng.toFixed(6),
      h.gpsAccuracyM === null ? "" : Math.round(h.gpsAccuracyM),
      s.standardMs,
      s.fullMs,
      s.standard?.etaS,
      s.standard?.distanceM,
      s.police?.etaS,
      s.police?.distanceM,
      s.police?.restrictions?.join("; "),
      s.fastest,
      s.kind,
      s.staleRefresh ? "yes" : "no",
      iso(s.goAt),
      iso(s.endedAt),
      s.ended,
      s.durationS,
      s.drivenM,
      s.firstEtaS,
      s.etaErrorS,
      s.reroutes,
      s.offRoutes,
      s.marks,
      s.tapsIgnored,
      Math.round(s.noSignalS),
      Math.round(s.noAnswerS),
      others.googleApple,
    ]),
  ]);
}

/** An event's details as one readable cell. */
function details(e: TripEvent, notes: Record<string, string>): string {
  const { t: _t, type: _type, ...rest } = e;
  const out: Record<string, unknown> = { ...rest };
  // Position has its own columns.
  delete out.lat;
  delete out.lng;
  if (e.type === "mark") {
    out.label = MARKS.find((m) => m.tag === e.tag)?.label ?? e.tag;
    const note = notes[String(e.t)];
    if (note) out.note = note;
  }
  return Object.entries(out)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("; ");
}

export function eventsCsv(trips: readonly { record: TripRecord; events: readonly TripEvent[] }[]): string {
  const rows: unknown[][] = [["trip_id", "time", "type", "lat", "lng", "details"]];
  for (const { record, events } of trips) {
    for (const e of events) {
      const pos = "lat" in e ? e : null;
      rows.push([
        record.header.id,
        iso(e.t),
        e.type,
        pos ? pos.lat.toFixed(6) : "",
        pos ? pos.lng.toFixed(6) : "",
        details(e, record.notes),
      ]);
    }
  }
  return csv(rows);
}

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** GPX 1.1: one track per trip from its breadcrumbs, marks and re-routes as waypoints. */
export function gpx(trips: readonly { record: TripRecord; events: readonly TripEvent[] }[]): string {
  const wpts: string[] = [];
  const trks: string[] = [];
  for (const { record, events } of trips) {
    const fixes = events.filter((e): e is Extract<TripEvent, { type: "fix" }> => e.type === "fix");
    let lastPos: { lat: number; lng: number } | null = null;
    for (const e of events) {
      if (e.type === "fix") lastPos = e;
      const at = e.type === "mark" ? e : e.type === "reroute" ? lastPos : null;
      if (!at) continue;
      const name =
        e.type === "mark" ? (MARKS.find((m) => m.tag === e.tag)?.label ?? e.tag) : `Re-route (${e.type === "reroute" ? e.trigger : ""})`;
      const note = e.type === "mark" ? record.notes[String(e.t)] : undefined;
      wpts.push(
        `  <wpt lat="${at.lat.toFixed(6)}" lon="${at.lng.toFixed(6)}"><time>${iso(e.t)}</time><name>${xml(name)}</name>` +
          (note ? `<desc>${xml(note)}</desc>` : "") +
          `</wpt>`,
      );
    }
    const pts = fixes
      .map(
        (f) =>
          `      <trkpt lat="${f.lat.toFixed(6)}" lon="${f.lng.toFixed(6)}"><time>${iso(f.t)}</time></trkpt>`,
      )
      .join("\n");
    trks.push(
      `  <trk><name>${xml(`${record.header.destination.title} (${record.header.id})`)}</name>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>`,
    );
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="BlueRoute" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    [...wpts, ...trks].join("\n") +
    `\n</gpx>\n`
  );
}
