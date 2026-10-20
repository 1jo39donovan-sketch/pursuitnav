import type { Costing } from "./costing.js";
import { decodePolyline6, type LngLat } from "./geo.js";

export interface Waypoint {
  point: LngLat;
  /** Direction of travel at this point, degrees from north; snaps to roads going this way. */
  heading?: number;
}

export interface Maneuver {
  type: number;
  instruction: string;
  streetNames: string[];
  lengthM: number;
  timeS: number;
  beginShapeIndex: number;
  endShapeIndex: number;
}

export interface Route {
  durationS: number;
  distanceM: number;
  shape: LngLat[];
  maneuvers: Maneuver[];
  /**
   * The OpenStreetMap ways along the route, by shape index. The phone times
   * itself along them for opt-in learning, so no GPS has to leave it.
   */
  ways?: RouteWay[];
}

export interface RouteWay {
  wayId: number;
  beginShapeIndex: number;
  endShapeIndex: number;
}

/** Runs of edges on the same way, as one entry each. */
export function waysOf(edges: TraceEdge[]): RouteWay[] {
  const out: RouteWay[] = [];
  for (const e of edges) {
    if (e.wayId === undefined) continue;
    const last = out[out.length - 1];
    if (last && last.wayId === e.wayId && last.endShapeIndex === e.beginShapeIndex) last.endShapeIndex = e.endShapeIndex;
    else out.push({ wayId: e.wayId, beginShapeIndex: e.beginShapeIndex, endShapeIndex: e.endShapeIndex });
  }
  return out;
}

export interface TraceEdge {
  names: string[];
  /** OpenStreetMap way the edge is part of (for learned speeds); absent from test doubles. */
  wayId?: number;
  beginShapeIndex: number;
  endShapeIndex: number;
  beginHeading: number;
  endHeading: number;
}

export class ValhallaError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    /** Valhalla's own error code, e.g. 442 no route, 171 no road near a point. */
    readonly code: number | undefined,
  ) {
    super(message);
  }
}

export interface RouteRequest {
  costing: Costing;
  from: Waypoint;
  to: Waypoint;
  /** Points whose nearest road must not be used. */
  exclude?: LngLat[];
  /** Skip turn-by-turn text; cheaper when only the distance matters. */
  distanceOnly?: boolean;
  /** Closed rings of [lng, lat]; roads crossing them aren't used (live closures). */
  avoidAreas?: LngLat[][];
}

/** Signed size and weight limits on the road at a point (metres, tonnes). */
export interface SizeLimits {
  height?: number;
  width?: number;
  length?: number;
  weight?: number;
}

export interface Router {
  route(req: RouteRequest): Promise<Route>;
  traceEdges(shape: LngLat[], costing: Costing): Promise<TraceEdge[]>;
  /**
   * For each point, the strictest limits on roads there with one of the
   * given names (any road if no names). Optional: test doubles leave it out.
   */
  sizeLimitsAt?(points: Array<{ point: LngLat; names: string[] }>): Promise<SizeLimits[]>;
  /** The route along a driven track, matched to the roads. Optional: test doubles leave it out. */
  traceRoute?(points: LngLat[], costing: Costing): Promise<Route>;
}

/** The road a GPS trace was on at its last point. */
export interface MatchedRoad {
  names: string[];
  /** Signed limit in km/h from OSM maxspeed; undefined when not tagged. */
  speedLimitKph?: number;
}

/** A road edge at or near a point, from Valhalla's /locate. */
export interface LocatedEdge {
  names: string[];
  /** Direction of travel along the edge at the point, degrees. */
  heading: number;
  /** 0 at the edge's start node, 1 at its end node. */
  percentAlong: number;
  lengthM: number;
  /** Edge geometry in travel order, start node to end node. */
  shape: LngLat[];
  car: boolean;
  /** Valhalla's road use: "road", "service_road", "footway", … */
  use: string;
  speedLimitKph?: number;
}

export interface Matcher {
  matchRoad(points: LngLat[]): Promise<MatchedRoad | null>;
  locate(point: LngLat, heading?: number): Promise<LocatedEdge[]>;
}

const location = (w: Waypoint) => ({
  lat: w.point[1],
  lon: w.point[0],
  ...(w.heading !== undefined ? { heading: Math.round(w.heading), heading_tolerance: 45 } : {}),
});

interface ValhallaRouteResponse {
  trip: {
    summary: { time: number; length: number };
    legs: Array<{
      shape: string;
      maneuvers: Array<{
        type: number;
        instruction: string;
        street_names?: string[];
        length: number;
        time: number;
        begin_shape_index: number;
        end_shape_index: number;
      }>;
    }>;
  };
}

interface ValhallaTraceResponse {
  edges?: Array<{
    names?: string[];
    way_id?: number;
    begin_shape_index: number;
    end_shape_index: number;
    begin_heading: number;
    end_heading: number;
  }>;
}

const LIMIT_TYPES: Record<string, keyof SizeLimits> = {
  max_height: "height",
  max_width: "width",
  max_length: "length",
  max_weight: "weight",
};

interface ValhallaLocateResponse {
  edges?: Array<{
    access_restrictions?: Array<{ type: string; value: number; car?: boolean; bus?: boolean; truck?: boolean }>;
    heading: number;
    percent_along: number;
    edge_info: { names?: string[]; shape: string; speed_limit?: number };
    edge: {
      forward: boolean;
      access: { car: boolean };
      classification: { use: string };
      geo_attributes: { length: number };
    };
  }> | null;
}

/** Valhalla reports 0 for "not tagged" and 255 for "no limit"; neither is a number to show. */
const signedLimit = (kph?: number) => (kph && kph > 0 && kph < 255 ? kph : undefined);

function tripRoute(data: ValhallaRouteResponse): Route {
  // A trace can come back in several legs where it lost the road; join them.
  const shape: LngLat[] = [];
  const maneuvers: Maneuver[] = [];
  for (const [k, leg] of data.trip.legs.entries()) {
    const offset = Math.max(0, shape.length - 1);
    const legShape = decodePolyline6(leg.shape);
    shape.push(...(shape.length ? legShape.slice(1) : legShape));
    const last = k === data.trip.legs.length - 1;
    for (const m of leg.maneuvers ?? []) {
      // Arrival at the end of a leg that isn't the last isn't an arrival.
      if (!last && ARRIVE_TYPES.has(m.type)) continue;
      maneuvers.push({
        type: m.type,
        instruction: m.instruction,
        streetNames: m.street_names ?? [],
        lengthM: m.length * 1000,
        timeS: m.time,
        beginShapeIndex: m.begin_shape_index + offset,
        endShapeIndex: m.end_shape_index + offset,
      });
    }
  }
  return { durationS: data.trip.summary.time, distanceM: data.trip.summary.length * 1000, shape, maneuvers };
}

/** Valhalla's "you have arrived" maneuver types. */
export const ARRIVE_TYPES = new Set([4, 5, 6]);

/** Talks to a Valhalla server over HTTP. */
export class ValhallaClient implements Router, Matcher {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 15000,
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new ValhallaError(`Routing engine unreachable: ${(err as Error).message}`, 503, undefined);
    }
    const json = (await res.json().catch(() => ({}))) as { error?: string; error_code?: number };
    if (!res.ok) {
      throw new ValhallaError(json.error ?? `Valhalla returned ${res.status}`, res.status, json.error_code);
    }
    return json as T;
  }

  async route(req: RouteRequest): Promise<Route> {
    const body = {
      locations: [location(req.from), location(req.to)],
      costing: req.costing.costing,
      costing_options: { [req.costing.costing]: req.costing.options },
      // Leave now: time-limited restrictions apply as they do right now.
      date_time: { type: 0 },
      directions_options: req.distanceOnly
        ? { directions_type: "none" }
        : { units: "kilometers", language: "en-GB" },
      ...(req.exclude?.length ? { exclude_locations: req.exclude.map((p) => location({ point: p })) } : {}),
      ...(req.avoidAreas?.length ? { exclude_polygons: req.avoidAreas } : {}),
    };
    return tripRoute(await this.post<ValhallaRouteResponse>("/route", body));
  }

  /** The route along a driven GPS track, matched to the roads, with turn-by-turn. */
  async traceRoute(points: LngLat[], costing: Costing): Promise<Route> {
    const data = await this.post<ValhallaRouteResponse>("/trace_route", {
      shape: points.map(([lon, lat]) => ({ lat, lon })),
      costing: costing.costing,
      costing_options: { [costing.costing]: costing.options },
      shape_match: "map_snap",
      trace_options: { search_radius: 40, gps_accuracy: 15 },
      directions_options: { units: "kilometers", language: "en-GB" },
    });
    return tripRoute(data);
  }

  /** Map-matches a short GPS trace; the road at its last point. Null if it can't be matched. */
  async matchRoad(points: LngLat[]): Promise<MatchedRoad | null> {
    try {
      const data = await this.post<{
        edges?: Array<{ names?: string[]; speed_limit?: number }>;
        matched_points?: Array<{ edge_index?: number; type: string }>;
      }>("/trace_attributes", {
        shape: points.map(([lon, lat]) => ({ lat, lon })),
        // Match whatever the car actually drives, against the flow or not.
        costing: "auto",
        costing_options: { auto: { ignore_oneways: true, ignore_restrictions: true } },
        shape_match: "map_snap",
        trace_options: { search_radius: 35, gps_accuracy: 15 },
        filters: { attributes: ["edge.names", "edge.speed_limit", "matched.edge_index", "matched.type"], action: "include" },
      });
      const last = [...(data.matched_points ?? [])].reverse().find((m) => m.type !== "unmatched");
      const edge = last?.edge_index !== undefined ? data.edges?.[last.edge_index] : undefined;
      if (!edge) return null;
      return { names: edge.names ?? [], speedLimitKph: signedLimit(edge.speed_limit) };
    } catch (err) {
      if (err instanceof ValhallaError && err.httpStatus < 500) return null;
      throw err;
    }
  }

  /** Road edges at a point; with a heading, only those running that way. */
  async locate(point: LngLat, heading?: number): Promise<LocatedEdge[]> {
    const data = await this.post<ValhallaLocateResponse[]>("/locate", {
      locations: [location({ point, heading })],
      costing: "auto",
      costing_options: { auto: { ignore_oneways: true } },
      verbose: true,
    });
    return (data[0]?.edges ?? []).map((e) => {
      const shape = decodePolyline6(e.edge_info.shape);
      return {
        names: e.edge_info.names ?? [],
        heading: e.heading,
        percentAlong: e.percent_along,
        lengthM: e.edge.geo_attributes.length,
        // Shapes are stored once per road; a reverse-direction edge reads them backwards.
        shape: e.edge.forward ? shape : shape.reverse(),
        car: e.edge.access.car,
        use: e.edge.classification.use,
        speedLimitKph: signedLimit(e.edge_info.speed_limit),
      };
    });
  }

  async sizeLimitsAt(points: Array<{ point: LngLat; names: string[] }>): Promise<SizeLimits[]> {
    const out: SizeLimits[] = [];
    // Batched: one request per hundred points.
    for (let i = 0; i < points.length; i += 100) {
      const batch = points.slice(i, i + 100);
      const data = await this.post<ValhallaLocateResponse[]>("/locate", {
        locations: batch.map((p) => location({ point: p.point })),
        costing: "auto",
        costing_options: { auto: { ignore_oneways: true, ignore_restrictions: true } },
        verbose: true,
      });
      batch.forEach((p, k) => {
        const limits: SizeLimits = {};
        for (const edge of data[k]?.edges ?? []) {
          const names = edge.edge_info.names ?? [];
          if (p.names.length && !names.some((n) => p.names.includes(n))) continue;
          for (const r of edge.access_restrictions ?? []) {
            const key = LIMIT_TYPES[r.type];
            if (!key || !(r.car || r.bus || r.truck) || !(r.value > 0)) continue;
            limits[key] = Math.min(limits[key] ?? Infinity, r.value);
          }
        }
        out.push(limits);
      });
    }
    return out;
  }

  /** The road edges a route shape runs along, in order. */
  async traceEdges(shape: LngLat[], costing: Costing): Promise<TraceEdge[]> {
    const data = await this.post<ValhallaTraceResponse>("/trace_attributes", {
      shape: shape.map(([lon, lat]) => ({ lat, lon })),
      costing: costing.costing,
      costing_options: { [costing.costing]: costing.options },
      shape_match: "edge_walk",
      filters: {
        attributes: [
          "edge.names",
          "edge.way_id",
          "edge.begin_shape_index",
          "edge.end_shape_index",
          "edge.begin_heading",
          "edge.end_heading",
        ],
        action: "include",
      },
    });
    // Indices are into Valhalla's matched shape, which can have a point more
    // than the one sent (where it snaps the end); keep them in our shape.
    const last = shape.length - 1;
    return (data.edges ?? []).map((e) => ({
      names: e.names ?? [],
      wayId: e.way_id,
      beginShapeIndex: Math.min(e.begin_shape_index, last),
      endShapeIndex: Math.min(e.end_shape_index, last),
      beginHeading: e.begin_heading,
      endHeading: e.end_heading,
    }));
  }
}
