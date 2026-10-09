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
}

export interface TraceEdge {
  names: string[];
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
}

export interface Router {
  route(req: RouteRequest): Promise<Route>;
  traceEdges(shape: LngLat[], costing: Costing): Promise<TraceEdge[]>;
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
    begin_shape_index: number;
    end_shape_index: number;
    begin_heading: number;
    end_heading: number;
  }>;
}

/** Talks to a Valhalla server over HTTP. */
export class ValhallaClient implements Router {
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
    };
    const data = await this.post<ValhallaRouteResponse>("/route", body);
    const leg = data.trip.legs[0]!;
    return {
      durationS: data.trip.summary.time,
      distanceM: data.trip.summary.length * 1000,
      shape: decodePolyline6(leg.shape),
      maneuvers: (leg.maneuvers ?? []).map((m) => ({
        type: m.type,
        instruction: m.instruction,
        streetNames: m.street_names ?? [],
        lengthM: m.length * 1000,
        timeS: m.time,
        beginShapeIndex: m.begin_shape_index,
        endShapeIndex: m.end_shape_index,
      })),
    };
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
          "edge.begin_shape_index",
          "edge.end_shape_index",
          "edge.begin_heading",
          "edge.end_heading",
        ],
        action: "include",
      },
    });
    return (data.edges ?? []).map((e) => ({
      names: e.names ?? [],
      beginShapeIndex: e.begin_shape_index,
      endShapeIndex: e.end_shape_index,
      beginHeading: e.begin_heading,
      endHeading: e.end_heading,
    }));
  }
}
