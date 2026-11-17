// Live closures on National Highways' roads (motorways and major A-roads),
// for Kent and Essex, where TfL's feed doesn't reach; London's motorways too.
//
// The server polls National Highways' Road and Lane Closures API (free key,
// NATIONAL_HIGHWAYS_KEY) every 5 minutes, planned and unplanned, and turns
// every carriageway closure inside the region into the same thin boxes as
// TfL's closed streets, so both routes keep clear of them. Lane closures and
// "other" works (narrow lanes, speed limits) leave the road open: not avoided.
// Nothing about officers or their routes is sent: the feed is fetched the
// same way whoever is driving.
//
// Terms (developer.data.nationalhighways.co.uk/terms, based on OGL v2.0 with
// their amendments, checked by the PM 17 Nov 2026): commercial use allowed
// (19c); credit exactly "Powered by National Highways' Transport Data Feeds"
// (20a; in the app's credits, store listing and site pages), no logo without
// their branding guidelines (20b); access can be cut off for abuse (17) and
// scraping or data mining needs a separate licence (21e). So: one modest poll
// every 5 minutes (about 5 requests: the planned pages and the unplanned one),
// and if access stops, routes carry on with TfL's closures only.
//
// The feed is DATEX II v3.4 as JSON (read from a real response, 17 Nov 2026):
//   D2Payload.situation[].situationRecord[].sitRoadOrCarriagewayOrLaneManagement
//     .roadOrCarriagewayOrLaneManagementType.value  "carriagewayClosures" | "laneClosures" | "other"
//     .validity.validityStatus                      "active" | "planned" | "suspended"
//     .validity.validityTimeSpecification.overallStartTime / overallEndTime
//     .locationReference … gmlLineString.locGmlLineString.posList  "lat lng lat lng …"
//     .locationReference … supplementaryPositionalDescription.locationDescription
// Paging: the next page's URL is in the x-next header.
import { boxesAlong, joinLines, type Closure, type ClosureSummary, type Delay } from "./closures.js";
import { distanceM, type LngLat } from "./geo.js";

const BASE = "https://api.data.nationalhighways.co.uk/roads/v2.0/closures";
// A "planned" closure counts only inside a window this short: a scheme of
// overnight works can run for months, with the road open all day.
const PLANNED_MAX_MS = 24 * 60 * 60_000;
// The feed is paged; a bad day shouldn't run away with requests (10 a minute allowed).
const MAX_PAGES = 8;
const STALE_MS = 60 * 60_000;
// The feed draws closures in fine detail (one A259 closure was 457 points);
// a box every ~30 m covers the road just as well and keeps within the
// router's limit on avoid areas.
const THIN_M = 30;

/** The line with points at least THIN_M apart (always its ends). */
export function thinned(line: LngLat[]): LngLat[] {
  if (line.length <= 2) return line;
  const out: LngLat[] = [line[0]!];
  for (let i = 1; i < line.length - 1; i++) {
    if (distanceM(out[out.length - 1]!, line[i]!) >= THIN_M) out.push(line[i]!);
  }
  out.push(line[line.length - 1]!);
  return out;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Every "lat lng lat lng …" position list under a location reference, as lines of [lng, lat]. */
function linesIn(loc: unknown, out: LngLat[][] = []): LngLat[][] {
  if (Array.isArray(loc)) {
    for (const v of loc) linesIn(v, out);
  } else if (loc && typeof loc === "object") {
    for (const [k, v] of Object.entries(loc as Json)) {
      if (k === "posList" && typeof v === "string") {
        const n = v.trim().split(/\s+/).map(Number);
        const line: LngLat[] = [];
        for (let i = 0; i + 1 < n.length; i += 2) {
          const lat = n[i]!;
          const lng = n[i + 1]!;
          if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90) line.push([lng, lat]);
        }
        if (line.length >= 2) out.push(line);
      } else {
        linesIn(v, out);
      }
    }
  }
  return out;
}

/** The first location description under a location reference ("M20 eastbound between J5 and J6"). */
function describe(loc: unknown): string {
  if (Array.isArray(loc)) {
    for (const v of loc) {
      const d = describe(v);
      if (d) return d;
    }
  } else if (loc && typeof loc === "object") {
    for (const [k, v] of Object.entries(loc as Json)) {
      if (k === "locationDescription" && typeof v === "string") return v.trim();
      const d = describe(v);
      if (d) return d;
    }
  }
  return "";
}

/** Whether a closure record is in force now. */
export function inForce(record: Json, now: Date): boolean {
  const validity = obj(record.validity);
  const status = str(validity.validityStatus);
  if (status === "suspended") return false;
  const spec = obj(validity.validityTimeSpecification);
  const start = Date.parse(str(spec.overallStartTime) ?? "");
  const end = Date.parse(str(spec.overallEndTime) ?? "");
  const t = now.getTime();
  if (Number.isFinite(start) && start > t) return false;
  if (Number.isFinite(end) && end < t) return false;
  if (status === "active") return true;
  // Planned: only a short, definite window counts (see PLANNED_MAX_MS).
  return Number.isFinite(start) && Number.isFinite(end) && end - start <= PLANNED_MAX_MS;
}

const inside = (p: LngLat, [west, south, east, north]: [number, number, number, number]) =>
  p[0] >= west && p[0] <= east && p[1] >= south && p[1] <= north;

/** Carriageway closures in force now within the region, from one page of the feed. */
export function parseHighwaysClosures(
  json: unknown,
  bounds: [number, number, number, number],
  now = new Date(),
): Closure[] {
  const closures: Closure[] = [];
  const situations = obj(obj(json).D2Payload).situation;
  if (!Array.isArray(situations)) return closures;
  for (const sit of situations) {
    const records = obj(sit).situationRecord;
    if (!Array.isArray(records)) continue;
    for (const rec of records) {
      const r = obj(obj(rec).sitRoadOrCarriagewayOrLaneManagement);
      if (str(obj(r.roadOrCarriagewayOrLaneManagementType).value) !== "carriagewayClosures") continue;
      if (!inForce(r, now)) continue;
      const lines = linesIn(r.locationReference).filter((l) => l.some((p) => inside(p, bounds)));
      const rings = joinLines(lines).map(thinned).flatMap(boxesAlong);
      if (!rings.length) continue;
      closures.push({
        id: `nh:${str(r.idG) ?? str(obj(sit).idG) ?? "?"}`,
        street: describe(r.locationReference),
        rings,
      });
    }
  }
  return closures;
}

/** Polls National Highways (planned and unplanned) and keeps the current closures in memory. */
export class HighwaysFeed {
  private closures: Closure[] = [];
  private updatedAt?: Date;
  private timer?: NodeJS.Timeout;
  private lastFailure: string | number | null = null;

  constructor(
    private readonly key: string,
    private readonly bounds: [number, number, number, number],
    private readonly everyMs = 5 * 60_000,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly log: (status: string | number) => void = () => {},
  ) {}

  start() {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.everyMs);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
  }

  private async pages(first: string, now: Date): Promise<Closure[] | null> {
    const out: Closure[] = [];
    let url: string | null = first;
    for (let i = 0; url && i < MAX_PAGES; i++) {
      const res: Response = await this.fetchFn(url, {
        headers: {
          "Ocp-Apim-Subscription-Key": this.key,
          "X-Response-MediaType": "application/json",
          "X-Data-Format": "DATEXII",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        // Said once per change: no URL, so no key, in the log.
        if (res.status !== this.lastFailure) this.log(res.status);
        this.lastFailure = res.status;
        return null;
      }
      out.push(...parseHighwaysClosures(await res.json(), this.bounds, now));
      url = res.headers.get("x-next");
    }
    this.lastFailure = null;
    return out;
  }

  async refresh(now = new Date()): Promise<void> {
    // The API takes UTC times without an offset.
    const at = (ms: number) => new Date(ms).toISOString().slice(0, 19);
    const t = now.getTime();
    try {
      // Planned closures that may be in force now; unplanned ones from the last day.
      const planned = await this.pages(
        `${BASE}?closureType=planned&startDateTime=${at(t - 12 * 3600_000)}&endDateTime=${at(t + 3600_000)}`,
        now,
      );
      const unplanned = await this.pages(
        `${BASE}?closureType=unplanned&startDateTime=${at(t - 24 * 3600_000)}&endDateTime=${at(t)}`,
        now,
      );
      if (!planned || !unplanned) return; // keep the last good list
      const seen = new Set<string>();
      this.closures = [...planned, ...unplanned].filter((c) => !seen.has(c.id) && seen.add(c.id));
      this.updatedAt = now;
    } catch {
      // Unreachable: keep the last good list; stale closures are dropped below.
      if (this.lastFailure !== "no answer") this.log("no answer");
      this.lastFailure = "no answer";
    }
  }

  /** The closures to avoid; none if the feed hasn't been read for an hour (they may have reopened). */
  current(now = new Date()): Closure[] {
    if (!this.updatedAt || now.getTime() - this.updatedAt.getTime() > STALE_MS) return [];
    return this.closures;
  }

  summary(now = new Date()): ClosureSummary {
    const fresh = this.updatedAt && now.getTime() - this.updatedAt.getTime() <= STALE_MS;
    return { active: this.current(now).length, updatedAt: fresh ? this.updatedAt!.toISOString() : undefined };
  }
}

/** TfL's and National Highways' closures as one feed (either may be absent). */
export function combinedFeed(
  tfl?: { current(now?: Date): Closure[]; currentDelays?(now?: Date): Delay[]; summary(now?: Date): ClosureSummary },
  highways?: { current(now?: Date): Closure[]; summary(now?: Date): ClosureSummary },
) {
  const feeds = [tfl, highways].filter(<T>(f: T | undefined): f is T => !!f);
  return {
    current: (now = new Date()) => feeds.flatMap((f) => f.current(now)),
    currentDelays: (now = new Date()) => tfl?.currentDelays?.(now) ?? [],
    summary: (now = new Date()): ClosureSummary => {
      const parts = feeds.map((f) => f.summary(now));
      const times = parts.map((p) => p.updatedAt).filter((x): x is string => !!x).sort();
      const read = (f?: { summary(now?: Date): ClosureSummary }) => {
        const s = f?.summary(now);
        return s?.updatedAt ? s.active : null;
      };
      return {
        active: parts.reduce((n, p) => n + p.active, 0),
        ...(times[0] ? { updatedAt: times[0] } : {}),
        sources: { ...(tfl ? { tfl: read(tfl) } : {}), ...(highways ? { highways: read(highways) } : {}) },
      };
    },
  };
}
