// Field-test recording: what happened on each trip, kept on the phone for
// comparing BlueRoute with other apps afterwards (Session, "Field-test
// recording"; exported from the Log). Pure data and sums here; recorder.ts
// collects and stores them. Nothing in fieldtest/ talks to the network (a
// test checks): the trips never leave the phone unless the officer exports.

export const TRIP_FORMAT = 1;

/** One trip: a destination picked, and what followed. */
export interface TripHeader {
  id: string;
  format: number;
  appVersion: string;
  platform: string;
  vehicle: string;
  blueLight: boolean;
  /** Recorded on a demo drive (not real GPS): left out of "all" exports unless asked. */
  demo: boolean;
  /** ms since 1970 */
  startedAt: number;
  query: string;
  destination: { title: string; lat: number; lng: number };
  /** Metres, at the moment the destination was picked; null without a fix. */
  gpsAccuracyM: number | null;
}

export interface RouteOffered {
  etaS: number;
  distanceM: number;
  /** "No right turn: Upper Street into Islington Green", for a blue-light route. */
  restrictions?: string[];
}

export type RerouteTrigger = "auto" | "reroute-now" | "switch" | "stale-refresh" | "signal-back";
export type RerouteOutcome = "ok" | "no-signal" | "no-answer" | "error";
export type MarkTag =
  | "wrong-instruction"
  | "late-instruction"
  | "missed-turn"
  | "restriction-wrong"
  | "road-closed"
  | "other-app-better"
  | "good-call";
export type TripEnd = "arrived" | "end" | "new-destination";

export const MARKS: { tag: MarkTag; label: string }[] = [
  { tag: "wrong-instruction", label: "Wrong instruction" },
  { tag: "late-instruction", label: "Late instruction" },
  { tag: "missed-turn", label: "Missed turn" },
  { tag: "restriction-wrong", label: "Restriction wrong" },
  { tag: "road-closed", label: "Road closed" },
  { tag: "other-app-better", label: "Other app better here" },
  { tag: "good-call", label: "Good call" },
];

type Pos = { lat: number; lng: number };

/** Everything recorded during a trip, each with its time (ms since 1970). */
export type TripEvent = { t: number } & (
  | { type: "plan-standard"; ms: number; standard: RouteOffered }
  | { type: "plan-full"; ms: number; standard: RouteOffered | null; police: RouteOffered | null; fastest: "standard" | "police" }
  | { type: "plan-failed"; ms: number; outcome: RerouteOutcome }
  | { type: "go"; kind: string; staleRefresh: boolean }
  | { type: "tap-ignored" }
  | ({ type: "fix"; speed: number | null; heading: number | null; accuracy: number | null } & Pos)
  | ({ type: "off-route"; offByM: number } & Pos)
  | { type: "reroute"; trigger: RerouteTrigger; startedAt: number; ms: number; outcome: RerouteOutcome; kindBefore: string; kindAfter: string }
  | { type: "speech"; text: string }
  | { type: "signal"; state: "no-signal" | "no-answer" | "online" }
  | ({ type: "mark"; tag: MarkTag } & Pos)
  | { type: "eta"; etaS: number }
  | { type: "end"; reason: TripEnd }
);

/** Typed in by the operator: what the other apps said, in minutes. */
export interface OtherEtas {
  blueLightMaps: number | null;
  googleApple: number | null;
}

/** A stored trip: its header, the quotes and notes added later, and its sums. */
export interface TripRecord {
  header: TripHeader;
  others: OtherEtas;
  /** Notes typed on the Log afterwards, by mark time. */
  notes: Record<string, string>;
  summary: TripSummary;
}

export interface TripSummary {
  /** The route followed: standard, police, follow; null if never started. */
  kind: string | null;
  standardMs: number | null;
  fullMs: number | null;
  standard: RouteOffered | null;
  police: RouteOffered | null;
  fastest: "standard" | "police" | null;
  staleRefresh: boolean;
  goAt: number | null;
  endedAt: number | null;
  ended: TripEnd | null;
  /** From Go to the end. */
  durationS: number | null;
  /** Along the breadcrumbs. */
  drivenM: number;
  /** The first ETA shown once moving, against how long it took. */
  firstEtaS: number | null;
  etaErrorS: number | null;
  reroutes: number;
  offRoutes: number;
  marks: number;
  tapsIgnored: number;
  noSignalS: number;
  noAnswerS: number;
  fixes: number;
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
export function metres(a: Pos, b: Pos): number {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The trip's sums, from its events in time order. */
export function summarise(events: readonly TripEvent[]): TripSummary {
  const s: TripSummary = {
    kind: null,
    standardMs: null,
    fullMs: null,
    standard: null,
    police: null,
    fastest: null,
    staleRefresh: false,
    goAt: null,
    endedAt: null,
    ended: null,
    durationS: null,
    drivenM: 0,
    firstEtaS: null,
    etaErrorS: null,
    reroutes: 0,
    offRoutes: 0,
    marks: 0,
    tapsIgnored: 0,
    noSignalS: 0,
    noAnswerS: 0,
    fixes: 0,
  };
  let lastFix: Pos | null = null;
  let firstEtaAt: number | null = null;
  let signal: { state: "no-signal" | "no-answer"; since: number } | null = null;
  const closeSignal = (t: number) => {
    if (!signal) return;
    const secs = Math.max(0, (t - signal.since) / 1000);
    if (signal.state === "no-signal") s.noSignalS += secs;
    else s.noAnswerS += secs;
    signal = null;
  };
  for (const e of events) {
    switch (e.type) {
      case "plan-standard":
        s.standardMs ??= e.ms;
        s.standard ??= e.standard;
        break;
      case "plan-full":
        s.fullMs = e.ms;
        s.standard = e.standard ?? s.standard;
        s.police = e.police;
        s.fastest = e.fastest;
        break;
      case "go":
        s.kind = e.kind;
        s.goAt ??= e.t;
        s.staleRefresh ||= e.staleRefresh;
        break;
      case "tap-ignored":
        s.tapsIgnored++;
        break;
      case "fix":
        s.fixes++;
        if (lastFix) s.drivenM += metres(lastFix, e);
        lastFix = { lat: e.lat, lng: e.lng };
        break;
      case "off-route":
        s.offRoutes++;
        break;
      case "reroute":
        s.reroutes++;
        if (e.outcome === "ok") s.kind = e.kindAfter;
        break;
      case "mark":
        s.marks++;
        break;
      case "eta":
        if (s.firstEtaS === null) {
          s.firstEtaS = e.etaS;
          firstEtaAt = e.t;
        }
        break;
      case "signal":
        closeSignal(e.t);
        if (e.state !== "online") signal = { state: e.state, since: e.t };
        break;
      case "end":
        closeSignal(e.t);
        s.endedAt = e.t;
        s.ended = e.reason;
        break;
      default:
        break;
    }
  }
  if (s.goAt !== null && s.endedAt !== null) s.durationS = Math.round((s.endedAt - s.goAt) / 1000);
  // Only an arrival says how long it really took.
  if (s.ended === "arrived" && s.firstEtaS !== null && firstEtaAt !== null && s.endedAt !== null) {
    s.etaErrorS = Math.round((s.endedAt - firstEtaAt) / 1000 - s.firstEtaS);
  }
  s.drivenM = Math.round(s.drivenM);
  return s;
}

/** Storage limits: never deleted silently, recording stops at the cap with a warning before it. */
export const MAX_TRIPS = 200;
export const MAX_BYTES = 50 * 1024 * 1024;

export function storageState(trips: number, bytes: number): "ok" | "nearly-full" | "full" {
  const used = Math.max(trips / MAX_TRIPS, bytes / MAX_BYTES);
  if (used >= 1) return "full";
  if (used >= 0.9) return "nearly-full";
  return "ok";
}

export function storageText(trips: number, bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const used = `${trips} trip${trips === 1 ? "" : "s"}, ${mb < 0.1 ? "under 0.1" : mb.toFixed(1)} MB`;
  const state = storageState(trips, bytes);
  if (state === "full") return `${used}: full. Export and delete trips to record more.`;
  if (state === "nearly-full") return `${used}: nearly full (limit ${MAX_TRIPS} trips or 50 MB).`;
  return used;
}
