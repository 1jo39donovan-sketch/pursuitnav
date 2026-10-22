// Live road closures from TfL, kept clear of on both routes.
//
// The server polls TfL's road disruption feed (free; an app key from the TfL
// API portal stops it being throttled) and turns every street TfL lists as
// fully closed into a thin box along the closed stretch. Every route request
// then asks Valhalla to avoid those boxes. Nothing about officers or their
// routes is sent to TfL: the feed is fetched the same way whoever is driving.
//
// Only streets closed to traffic count ("Closed" in the live feed). Lane
// closures and partial closures are passable, and an emergency vehicle can
// often get past them anyway. A street closed in one direction is avoided in
// both: the feed's segments don't say which carriageway.
//
// The same feed lists holdups TfL rates Serious or Severe (works, collisions,
// slow traffic) on open streets. A route through one is tried again round
// it; if that costs little it's taken and said, otherwise the route stays
// and carries TfL's update, so the operator can decide.
import { distanceM, type LngLat } from "./geo.js";
import { ValhallaError, type Route, type RouteRequest, type Router } from "./valhalla.js";

export interface Closure {
  id: string;
  street: string;
  /** Thin boxes along the closed stretch, as closed rings of [lng, lat]. */
  rings: LngLat[][];
}

/** A serious holdup TfL lists on a street that's still open. */
export interface Delay {
  id: string;
  street: string;
  severity: "Serious" | "Severe";
  /** TfL's latest word on it, e.g. "Southbound traffic is slow moving…". */
  update: string;
  /** The affected stretch, as lines of [lng, lat] (or just TfL's point for it). */
  lines: LngLat[][];
}

/** What a route says about a holdup: on it, or routed round. */
export interface DelayNote {
  street: string;
  severity: "Serious" | "Severe";
  update: string;
  location: { lat: number; lng: number };
}

export interface ClosureSummary {
  /** Closures being avoided right now. */
  active: number;
  /** When the feed was last read successfully (ISO time); undefined if never. */
  updatedAt?: string;
}

// Half the width of the box along a closed street. Narrow enough to stay off
// parallel roads, wide enough to cover a two-way street drawn down its middle.
const HALF_WIDTH_M = 7;
// Kept off the junctions at each end, so the roads crossing there stay open.
const END_TRIM_M = 15;
// A closure this close to the start or the destination is left to the officer:
// they may be inside it, or going to it.
const NEAR_END_M = 300;
// Valhalla's limits on avoid areas are raised to suit (scripts/build-map.sh);
// this keeps a very bad day in London within them.
const MAX_RINGS = 600;

/** Closures in TfL's /Road/all/Disruption response. Tolerant of missing fields. */
export function parseDisruptions(json: unknown, now = new Date()): Closure[] {
  if (!Array.isArray(json)) return [];
  const closures: Closure[] = [];
  for (const d of json as TflDisruption[]) {
    if (!d || typeof d !== "object") continue;
    if (!isLive(d, now)) continue;
    for (const [k, s] of (d.streets ?? []).entries()) {
      if (!isClosed(s?.closure)) continue;
      // A closed street comes as many short pieces (one per road link, often
      // 20–100 m): join them up first, so only the ends of each closed
      // stretch are trimmed back from the junctions, not every piece.
      const lines = (s.segments ?? []).map((seg) => parseLine(seg?.lineString)).filter((l) => l.length >= 2);
      const rings = joinLines(lines).flatMap(boxesAlong);
      if (rings.length) closures.push({ id: `${d.id ?? "?"}:${k}`, street: s.name ?? "", rings });
    }
  }
  return closures;
}

interface TflDisruption {
  id?: string;
  status?: string;
  severity?: string;
  point?: string;
  comments?: string;
  currentUpdate?: string;
  startDateTime?: string;
  endDateTime?: string;
  streets?: Array<{
    name?: string;
    closure?: string;
    segments?: Array<{ lineString?: string }>;
  }>;
}

/** Holdups TfL rates Serious or Severe on streets that aren't closed (those are avoided outright). */
export function parseDelays(json: unknown, now = new Date()): Delay[] {
  if (!Array.isArray(json)) return [];
  const delays: Delay[] = [];
  for (const d of json as TflDisruption[]) {
    if (!d || typeof d !== "object" || !isLive(d, now)) continue;
    const severity = /^severe/i.test(d.severity ?? "") ? "Severe" : /^serious/i.test(d.severity ?? "") ? "Serious" : null;
    if (!severity) continue;
    const open = (d.streets ?? []).filter((s) => !isClosed(s?.closure));
    let lines = open.flatMap((s) => (s.segments ?? []).map((seg) => parseLine(seg?.lineString)));
    lines = lines.filter((l) => l.length >= 2);
    if (!lines.length) {
      const point = parseLine(`[${d.point ?? ""}]`);
      if (!point.length) continue;
      lines = [point];
    }
    delays.push({
      id: d.id ?? "?",
      street: open[0]?.name ?? (d.streets ?? [])[0]?.name ?? "",
      severity,
      update: shortUpdate(d.currentUpdate || d.comments || ""),
      lines,
    });
  }
  return delays;
}

/** TfL's update, to its first sentence or so. */
function shortUpdate(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= 160) return t;
  const cut = t.slice(0, 160);
  const end = cut.lastIndexOf(". ");
  return end > 60 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

// A holdup is on a route when its stretch passes this close to it.
const ON_ROUTE_M = 25;

/** The holdups a route passes through. */
export function delaysOn(shape: LngLat[], delays: Delay[]): Delay[] {
  if (!shape.length || !delays.length) return [];
  // A cheap box round the route first: most holdups are nowhere near it.
  const pad = 0.0005;
  const lngs = shape.map((p) => p[0]);
  const lats = shape.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...lngs) - pad, Math.max(...lngs) + pad, Math.min(...lats) - pad, Math.max(...lats) + pad];
  return delays.filter((d) =>
    d.lines.some((line) =>
      line.some(
        (p) =>
          p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n && shape.some((q) => distanceM(p, q) < ON_ROUTE_M),
      ),
    ),
  );
}

export function delayNote(d: Delay): DelayNote {
  const p = d.lines[0]![Math.floor(d.lines[0]!.length / 2)]!;
  return { street: d.street, severity: d.severity, update: d.update, location: { lat: p[1], lng: p[0] } };
}

/**
 * A street closed to traffic. The live feed says "Closed" (its documentation
 * says "Full Closure"); "Partial Closure" and "Open" are passable.
 */
export const isClosed = (closure: string | undefined) => /^\s*(closed|full)/i.test(closure ?? "");

// Pieces whose ends are this close are one line.
const JOIN_M = 2;

/** Joins lines that meet end to end into longer lines (reversing pieces as needed). */
export function joinLines(lines: LngLat[][]): LngLat[][] {
  const left = lines.map((l) => [...l]);
  const out: LngLat[][] = [];
  const near = (a: LngLat, b: LngLat) => distanceM(a, b) <= JOIN_M;
  while (left.length) {
    let line = left.shift()!;
    for (let grew = true; grew; ) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const piece = left[i]!;
        const [first, last] = [line[0]!, line[line.length - 1]!];
        const [pFirst, pLast] = [piece[0]!, piece[piece.length - 1]!];
        if (near(last, pFirst)) line = [...line, ...piece.slice(1)];
        else if (near(last, pLast)) line = [...line, ...piece.slice(0, -1).reverse()];
        else if (near(first, pLast)) line = [...piece.slice(0, -1), ...line];
        else if (near(first, pFirst)) line = [...piece.slice(1).reverse(), ...line];
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    out.push(line);
  }
  return out;
}

function isLive(d: TflDisruption, now: Date): boolean {
  // "Active" and "Active Long Term" are in force; "Scheduled", "Recently
  // Cleared" and the like are not.
  if (d.status !== undefined && !/^active/i.test(d.status)) return false;
  const start = d.startDateTime ? Date.parse(d.startDateTime) : NaN;
  const end = d.endDateTime ? Date.parse(d.endDateTime) : NaN;
  if (Number.isFinite(start) && start > now.getTime()) return false;
  if (Number.isFinite(end) && end < now.getTime()) return false;
  return true;
}

/**
 * A street segment's line to points. TfL documents it as a "geoJSON formatted
 * LineString" of the segment's two ends: either the bare coordinates
 * "[[lng,lat],[lng,lat]]" or a whole {"type":"LineString","coordinates":…}.
 * [] if it's neither.
 */
function parseLine(raw: unknown): LngLat[] {
  if (typeof raw !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const coords = Array.isArray(parsed) ? parsed : (parsed as { coordinates?: unknown } | null)?.coordinates;
  if (!Array.isArray(coords)) return [];
  return coords.filter(
    (p): p is LngLat =>
      Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90,
  );
}

/** A thin box along each piece of the line, with the ends trimmed off. */
export function boxesAlong(line: LngLat[]): LngLat[][] {
  const pieces = trimEnds(line, END_TRIM_M);
  const boxes: LngLat[][] = [];
  for (let i = 1; i < pieces.length; i++) {
    const a = pieces[i - 1]!;
    const b = pieces[i]!;
    // Metres per degree here, to work in a flat local frame.
    const my = 111_320;
    const mx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
    const dx = (b[0] - a[0]) * mx;
    const dy = (b[1] - a[1]) * my;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    // Perpendicular offset of HALF_WIDTH_M, back in degrees.
    const ox = ((-dy / len) * HALF_WIDTH_M) / mx;
    const oy = ((dx / len) * HALF_WIDTH_M) / my;
    const ring: LngLat[] = [
      [a[0] + ox, a[1] + oy],
      [b[0] + ox, b[1] + oy],
      [b[0] - ox, b[1] - oy],
      [a[0] - ox, a[1] - oy],
    ];
    boxes.push([...ring, ring[0]!]);
  }
  return boxes;
}

/** The line with `m` metres cut off each end; [] if it's too short to keep any. */
function trimEnds(line: LngLat[], m: number): LngLat[] {
  const cut = (pts: LngLat[]): LngLat[] => {
    let left = m;
    for (let i = 1; i < pts.length; i++) {
      const d = distanceM(pts[i - 1]!, pts[i]!);
      if (d > left) {
        const f = left / d;
        const p = pts[i - 1]!;
        const q = pts[i]!;
        return [[p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f], ...pts.slice(i)];
      }
      left -= d;
    }
    return [];
  };
  const total = line.slice(1).reduce((s, p, i) => s + distanceM(line[i]!, p), 0);
  if (total <= 2 * m + 5) return [];
  return cut(cut(line).reverse()).reverse();
}

/** Polls TfL and keeps the current closures in memory. */
export class ClosureFeed {
  private closures: Closure[] = [];
  private delays: Delay[] = [];
  private updatedAt?: Date;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly url = "https://api.tfl.gov.uk/Road/all/Disruption",
    private readonly appKey?: string,
    private readonly everyMs = 5 * 60_000,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  start() {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.everyMs);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
  }

  async refresh(): Promise<void> {
    try {
      const url = new URL(this.url);
      url.searchParams.set("stripContent", "true");
      if (this.appKey) url.searchParams.set("app_key", this.appKey);
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return; // keep the last good list
      const json = await res.json();
      this.set(parseDisruptions(json), new Date(), parseDelays(json));
    } catch {
      // TfL unreachable: keep the last good list. Stale closures are dropped below.
    }
  }

  set(closures: Closure[], at = new Date(), delays: Delay[] = []) {
    this.closures = closures;
    this.delays = delays;
    this.updatedAt = at;
  }

  /** Serious holdups on open streets; none once the feed is an hour old. */
  currentDelays(now = new Date()): Delay[] {
    if (!this.updatedAt || now.getTime() - this.updatedAt.getTime() > 60 * 60_000) return [];
    return this.delays;
  }

  /** The closures to avoid; none if the feed hasn't been read for an hour (it may have reopened). */
  current(now = new Date()): Closure[] {
    if (!this.updatedAt || now.getTime() - this.updatedAt.getTime() > 60 * 60_000) return [];
    return this.closures;
  }

  summary(now = new Date()): ClosureSummary {
    const fresh = this.updatedAt && now.getTime() - this.updatedAt.getTime() <= 60 * 60_000;
    return { active: this.current(now).length, updatedAt: fresh ? this.updatedAt!.toISOString() : undefined };
  }
}

/** A route that avoided no closures it should have: set when they had to be ignored to find one. */
export interface ClosureAwareRoute extends Route {
  closuresIgnored?: boolean;
  /** Serious TfL holdups the route still goes through (no cheap way round). */
  delays?: DelayNote[];
  /** Serious TfL holdups it was routed round. */
  delaysAvoided?: DelayNote[];
}

// A way round a holdup is taken if it costs no more than this: TfL's
// "Serious" means real queues, so a couple of minutes round is a fair bet.
const DETOUR_MAX_S = 120;
const DETOUR_MAX_FRACTION = 0.15;

/**
 * Wraps a router so every route keeps clear of the current closures, except
 * ones right by the start or destination. If no route avoids them all, the
 * route is found without them and marked, rather than failing.
 */
export function avoidingClosures(
  router: Router,
  feed: Pick<ClosureFeed, "current"> & Partial<Pick<ClosureFeed, "currentDelays">>,
  nearEndM = NEAR_END_M,
): Router {
  const nearEnds = (req: RouteRequest, points: LngLat[]) =>
    points.some((p) => [req.from.point, req.to.point].some((e) => distanceM(p, e) < nearEndM));

  async function avoidClosures(req: RouteRequest): Promise<ClosureAwareRoute> {
    const rings = feed
      .current()
      .filter((c) => !c.rings.some((r) => nearEnds(req, r)))
      .flatMap((c) => c.rings)
      .slice(0, MAX_RINGS);
    if (!rings.length) return router.route(req);
    try {
      return await router.route({ ...req, avoidAreas: [...(req.avoidAreas ?? []), ...rings] });
    } catch (err) {
      // No way round them (442), or Valhalla refused the areas (its limits not
      // yet raised on this server): route without them rather than fail.
      if (!(err instanceof ValhallaError && err.httpStatus >= 400 && err.httpStatus < 500)) throw err;
      return { ...(await router.route(req)), closuresIgnored: true };
    }
  }

  return {
    async route(req: RouteRequest): Promise<ClosureAwareRoute> {
      const route = await avoidClosures(req);
      // Restriction checks only want distances: holdups don't matter there.
      if (req.distanceOnly || !feed.currentDelays) return route;
      // Holdups right by the start or destination are the officer's to judge.
      const on = delaysOn(route.shape, feed.currentDelays()).filter((d) => !d.lines.some((l) => nearEnds(req, l)));
      if (!on.length) return route;
      const rings = on.flatMap((d) => d.lines.flatMap(boxesAlong));
      const round = rings.length
        ? await avoidClosures({ ...req, avoidAreas: [...(req.avoidAreas ?? []), ...rings] }).catch(() => null)
        : null;
      const allowed = route.durationS + Math.max(DETOUR_MAX_S, route.durationS * DETOUR_MAX_FRACTION);
      if (round && round.durationS <= allowed && delaysOn(round.shape, on).length === 0) {
        return { ...round, delaysAvoided: on.map(delayNote) };
      }
      return { ...route, delays: on.map(delayNote) };
    },
    traceEdges: (shape, costing) => router.traceEdges(shape, costing),
    ...(router.sizeLimitsAt ? { sizeLimitsAt: (points) => router.sizeLimitsAt!(points) } : {}),
    // A colleague's track is followed as they drove it.
    ...(router.traceRoute ? { traceRoute: (points, costing) => router.traceRoute!(points, costing) } : {}),
  };
}
