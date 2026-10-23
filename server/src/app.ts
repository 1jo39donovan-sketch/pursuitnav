import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import cors from "@fastify/cors";
import Fastify, { LogController, type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

import type { ClosureAwareRoute, ClosureFeed } from "./closures.js";
import type { ServerConfig } from "./config.js";
import { BANDS, type LearningStore, type Sample } from "./learning.js";
import { ROAD_CHOICES, VEHICLE_TYPES, type RoadChoice, type VehicleType } from "./costing.js";
import type { LngLat } from "./geo.js";
import { offlineMapRoutes } from "./offlineMap.js";
import { privacyPage, supportPage } from "./pages.js";
import { dataRelease, machineMemory } from "./serverInfo.js";
import { PlacesError, type PlacesClient } from "./places.js";
import { FollowWrongWayError, planFollow } from "./follow.js";
import { NoSafeRouteError, planRoutes } from "./plan.js";
import { pursuitInfo } from "./pursuit.js";
import { MAX_BLOB_CHARS, NoSuchTeamError, TeamFullError, TeamStore, TeamTokenError } from "./teams.js";
import { APP_EVENTS, type UsageStore } from "./usage.js";
import { ValhallaError, type Matcher, type Router } from "./valhalla.js";

const point = {
  type: "object",
  required: ["lat", "lng"],
  additionalProperties: false,
  properties: {
    lat: { type: "number", minimum: -90, maximum: 90 },
    lng: { type: "number", minimum: -180, maximum: 180 },
  },
} as const;

interface FollowBody {
  from: { lat: number; lng: number; heading?: number };
  /** Their track as [lng, lat], oldest first, ending where they are. */
  track: number[][];
  vehicle?: VehicleType;
  roads?: RoadChoice;
}

interface RoutesBody {
  /** heading: direction of travel in degrees, when moving, so the route starts that way. */
  from: { lat: number; lng: number; heading?: number };
  to: { lat: number; lng: number };
  /** What's being driven; routes avoid limits it can't take. Defaults to a car. */
  vehicle?: VehicleType;
  /** Only the standard route (quick), for showing while the full plan is worked out. */
  standardOnly?: boolean;
  /** Prefer main roads (default) or any roads. */
  roads?: RoadChoice;
}

/** Constant-time check of an "Authorization: Bearer <token>" header. */
export function bearerMatches(header: string | undefined, token: string): boolean {
  const given = /^Bearer (.+)$/i.exec(header ?? "")?.[1] ?? "";
  // Compared as hashes, so the lengths match and nothing leaks through timing.
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return given.length > 0 && timingSafeEqual(digest(given), digest(token));
}

function routeError(err: unknown, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof NoSafeRouteError) {
    return reply.code(422).send({ error: "no-safe-route", message: err.message });
  }
  if (err instanceof ValhallaError) {
    if (err.code === 442) {
      return reply.code(422).send({ error: "no-route", message: "No route between these points." });
    }
    if (err.code === 171) {
      return reply.code(422).send({ error: "no-road-near", message: "No road found near one of the points." });
    }
    req.log.error({ status: err.httpStatus, code: err.code }, "routing engine error");
    return reply.code(503).send({ error: "routing-unavailable", message: "Routing is unavailable. Try again." });
  }
  throw err;
}

const teamId = { type: "string", pattern: "^[0-9a-f]{32}$" } as const;
const teamParams = {
  type: "object",
  required: ["teamId", "memberId"],
  properties: { teamId, memberId: teamId },
} as const;
const token = { type: "string", minLength: 32, maxLength: 64 } as const;

export function buildApp(
  config: ServerConfig,
  router: Router,
  places?: PlacesClient,
  matcher?: Matcher,
  /** Live road closures; the router passed in already avoids them. */
  closures?: Pick<ClosureFeed, "summary">,
  teams: TeamStore = new TeamStore(),
  /** Opt-in learning totals; uploads are refused without it. */
  learning?: LearningStore,
  /** Usage counts (no positions, no addresses); not counted without it. */
  usage?: UsageStore,
): FastifyInstance {
  // Requests carry officers' positions and control-room addresses, so the
  // API never logs requests or bodies; only failures, without their payloads.
  const app = Fastify({
    logger: { level: "warn" },
    logController: new LogController({ disableRequestLogging: true }),
  });

  // The phone app doesn't need CORS; the browser preview of the app does.
  // There are no cookies or credentials to protect.
  // The browser asks before each cross-site request with custom headers (a
  // CORS preflight); let it keep the answer, so a first search doesn't pay for
  // an extra round trip every time. Browsers cap this (Safari at 10 minutes,
  // Chrome at 2 hours).
  app.register(cors, { origin: true, methods: ["GET", "POST", "PUT", "DELETE"], maxAge: 86_400 });

  // Answers that mean "this feature isn't set up here" (no OS Places key, map
  // data not built yet). Deliberate, so not counted as server errors.
  const notSetUp = new WeakSet<FastifyRequest>();

  // Usage counts. Each request may carry the app's random install ID and its
  // version; they're counted (hashed, by day) and nothing else about the
  // request is kept. Plans and failures are counted by kind, never by content.
  if (usage) {
    app.addHook("onRequest", async (req) => {
      const id = req.headers["x-install-id"];
      const version = req.headers["x-app-version"];
      usage.seen(typeof id === "string" ? id : undefined, typeof version === "string" ? version : undefined);
    });
    app.addHook("onResponse", async (req, reply) => {
      const path = req.routeOptions.url;
      if (reply.statusCode >= 500 && !notSetUp.has(req)) usage.add("server_errors");
      if (path !== "/v1/routes" && path !== "/v1/follow") return;
      if (reply.statusCode === 422) usage.add("route_failures");
      // The app asks for the standard route alone first, then the full plan: count the plan once.
      const quick = (req.body as { standardOnly?: boolean } | undefined)?.standardOnly === true;
      if (reply.statusCode === 200 && !quick) usage.add("routes_planned");
    });
  }

  const inBounds = ({ lat, lng }: { lat: number; lng: number }) => {
    const [west, south, east, north] = config.bounds;
    return lng >= west && lng <= east && lat >= south && lat <= north;
  };

  // ok: the API is up. routing and places say whether the map data is built
  // yet (on a new server that takes 20–40 minutes after the API starts).
  // addresses: which address providers this server has; nominatim, whether
  // its house-number database is built and answering.
  app.get("/health", async () => {
    const routing = await fetch(`${config.valhallaUrl}/status`, { signal: AbortSignal.timeout(2000) })
      .then((res) => res.ok)
      .catch(() => false);
    const placesData = await stat(config.placesFile)
      .then(() => true)
      .catch(() => false);
    const addresses = (await places?.status?.()) ?? { osNames: false, nominatim: false, osPlaces: false };
    return {
      ok: true,
      routing,
      places: placesData,
      addresses,
      learning: Boolean(learning),
      ...(closures ? { closures: closures.summary().active } : {}),
      ...(config.version ? { version: config.version } : {}),
      ...(await dataRelease(config.placesFile).then((data) => (data ? { data } : {}))),
    };
  });

  // Linked from the app and the store listings.
  const privacy = privacyPage(config.contactEmail);
  const support = supportPage(config.contactEmail);
  app.get("/privacy", async (_req, reply) => reply.type("text/html; charset=utf-8").send(privacy));
  app.get("/support", async (_req, reply) => reply.type("text/html; charset=utf-8").send(support));
  app.get("/", async (_req, reply) => reply.redirect("/support"));

  app.post<{ Body: RoutesBody }>(
    "/v1/routes",
    {
      schema: {
        body: {
          type: "object",
          required: ["from", "to"],
          additionalProperties: false,
          properties: {
            from: {
              ...point,
              properties: { ...point.properties, heading: { type: "number", minimum: 0, maximum: 360 } },
            },
            to: point,
            vehicle: { type: "string", enum: [...VEHICLE_TYPES] },
            standardOnly: { type: "boolean" },
            roads: { type: "string", enum: [...ROAD_CHOICES] },
          },
        },
      },
    },
    async (req, reply) => {
      const { from, to, vehicle, standardOnly, roads } = req.body;
      if (!inBounds(from) || !inBounds(to)) {
        return reply.code(422).send({ error: "outside-area", message: "Both points must be in the covered area." });
      }
      const toLngLat = (p: { lat: number; lng: number }): LngLat => [p.lng, p.lat];
      try {
        const plan = await planRoutes(router, toLngLat(from), toLngLat(to), { ...config, standardOnly, roads }, from.heading, vehicle);
        if (!closures) return plan;
        const ignored = [plan.standard, plan.police].some((r) => (r as ClosureAwareRoute | null)?.closuresIgnored);
        return { ...plan, closures: { ...closures.summary(), ignored } };
      } catch (err) {
        return routeError(err, req, reply);
      }
    },
  );

  app.post<{ Body: { query: string } }>(
    "/v1/addresses",
    {
      schema: {
        body: {
          type: "object",
          required: ["query"],
          additionalProperties: false,
          properties: { query: { type: "string", minLength: 2, maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      if (!places) {
        notSetUp.add(req);
        return reply
          .code(503)
          .send({ error: "addresses-not-configured", message: "Full address search isn't set up on this server." });
      }
      try {
        // Older apps key each row by uprn; one per row keeps their lists right.
        const addresses = (await places.search(req.body.query)).map((a) => ({ ...a, uprn: a.uprn ?? a.id }));
        return { addresses };
      } catch (err) {
        if (err instanceof PlacesError) {
          // The status only: never the query.
          req.log.error({ status: err.status }, "Address search error");
          return reply.code(err.status).send({ error: "addresses-unavailable", message: "Address search is unavailable." });
        }
        throw err;
      }
    },
  );

  // Pursuit mode: the road the car is on, its speed limit and the next
  // junction, from the last few GPS points. Positions are never logged.
  app.post<{ Body: { points: { lat: number; lng: number }[]; heading?: number } }>(
    "/v1/pursuit",
    {
      schema: {
        body: {
          type: "object",
          required: ["points"],
          additionalProperties: false,
          properties: {
            points: { type: "array", minItems: 1, maxItems: 20, items: point },
            heading: { type: "number", minimum: 0, maximum: 360 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!matcher) {
        notSetUp.add(req);
        return reply.code(503).send({ error: "pursuit-unavailable" });
      }
      const { points, heading } = req.body;
      if (!points.every(inBounds)) {
        return reply.code(422).send({ error: "outside-area", message: "Outside the area Blue Route covers." });
      }
      try {
        return await pursuitInfo(matcher, points.map((p) => [p.lng, p.lat] as LngLat), heading);
      } catch (err) {
        if (err instanceof ValhallaError) {
          req.log.error({ status: err.httpStatus, code: err.code }, "routing engine error");
          return reply.code(503).send({ error: "routing-unavailable" });
        }
        throw err;
      }
    },
  );

  // Every named place in London for the app's offline place search. Public
  // OpenStreetMap data: the request carries nothing about the officer.
  // Data files the app keeps a copy of for searching with no signal. Sent
  // gzipped as built, with an ETag so an unchanged file isn't sent again.
  const dataFile = (path: string | undefined, notReady: string, what: string) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      const info = path ? await stat(path).catch(() => null) : null;
      if (!path || !info) {
        notSetUp.add(req);
        return reply.code(503).send({ error: notReady, message: `${what} hasn't been built yet.` });
      }
      const etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
      reply.header("etag", etag).header("last-modified", info.mtime.toUTCString()).header("cache-control", "no-cache");
      if (req.headers["if-none-match"] === etag) return reply.code(304).send();
      return reply
        .header("content-type", "text/plain; charset=utf-8")
        .header("content-encoding", "gzip")
        .header("content-length", info.size)
        .send(createReadStream(path));
    };
  app.get("/v1/places-data", dataFile(config.placesFile, "places-not-ready", "Place data"));
  app.get("/v1/roads-data", dataFile(config.roadsFile, "roads-not-ready", "The road list"));
  offlineMapRoutes(app, config.offlineMapDir);

  // Follow-in: the way a colleague drove, from here. Their track comes from the
  // phone (decrypted there) and, like every request, isn't logged or kept.
  app.post<{ Body: FollowBody }>(
    "/v1/follow",
    {
      schema: {
        body: {
          type: "object",
          required: ["from", "track"],
          additionalProperties: false,
          properties: {
            from: {
              ...point,
              properties: { ...point.properties, heading: { type: "number", minimum: 0, maximum: 360 } },
            },
            track: {
              type: "array",
              minItems: 2,
              maxItems: 600,
              items: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
            },
            vehicle: { type: "string", enum: [...VEHICLE_TYPES] },
            roads: { type: "string", enum: [...ROAD_CHOICES] },
          },
        },
      },
    },
    async (req, reply) => {
      const { from, track, vehicle, roads } = req.body;
      const points = track as LngLat[];
      if (!inBounds(from) || points.some(([lng, lat]) => !inBounds({ lat, lng }))) {
        return reply.code(422).send({ error: "outside-area", message: "Their track must be in the covered area." });
      }
      try {
        return await planFollow(router, [from.lng, from.lat], points, { ...config, roads }, from.heading, vehicle);
      } catch (err) {
        if (err instanceof FollowWrongWayError) {
          return reply.code(422).send({ error: "follow-refused", message: err.message });
        }
        // 443–445: the track couldn't be matched to the roads.
        if (err instanceof ValhallaError && err.code !== undefined && err.code >= 443 && err.code <= 445) {
          return reply.code(422).send({ error: "follow-refused", message: "Couldn't match their track to the roads." });
        }
        return routeError(err, req, reply);
      }
    },
  );

  // Opt-in learning: per-road times, never positions. Added to the totals and discarded.
  app.post<{ Body: { segments: Sample[] } }>(
    "/v1/learn",
    {
      bodyLimit: 400_000,
      schema: {
        body: {
          type: "object",
          required: ["segments"],
          additionalProperties: false,
          properties: {
            segments: {
              type: "array",
              maxItems: 3000,
              items: {
                type: "object",
                required: ["w", "s", "m", "b"],
                additionalProperties: false,
                properties: {
                  w: { type: "integer", minimum: 1 },
                  s: { type: "number", minimum: 2, maximum: 3600 },
                  m: { type: "number", minimum: 30, maximum: 20000 },
                  b: { type: "string", enum: [...BANDS] },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (!learning) return reply.code(404).send({ error: "learning-off", message: "Learning isn't switched on." });
      return { added: learning.add(req.body.segments) };
    },
  );

  // Events only the app sees (a navigation or pursuit session starting, a
  // request that timed out). Counts only.
  app.post<{ Body: { events: Record<string, number> } }>(
    "/v1/usage",
    {
      schema: {
        body: {
          type: "object",
          required: ["events"],
          additionalProperties: false,
          properties: {
            events: {
              type: "object",
              additionalProperties: false,
              properties: Object.fromEntries(
                Object.keys(APP_EVENTS).map((e) => [e, { type: "integer", minimum: 0, maximum: 1000 }]),
              ),
            },
          },
        },
      },
    },
    async (req) => {
      for (const [event, n] of Object.entries(req.body.events)) usage?.add(APP_EVENTS[event]!, n);
      return { ok: true };
    },
  );

  // The counts, for whoever runs the server: Authorization: Bearer <STATS_TOKEN>.
  // Off (404) unless STATS_TOKEN is set.
  const statsToken = config.statsToken;
  app.get("/stats", async (req, reply) => {
    if (!statsToken || !usage) return reply.code(404).send({ error: "not-found" });
    if (!bearerMatches(req.headers.authorization, statsToken)) {
      return reply.code(401).header("www-authenticate", "Bearer").send({ error: "unauthorized" });
    }
    return { ...usage.stats(), server: await machineMemory() };
  });

  // Team sessions. Blobs are sealed on the phones with a key the server never
  // sees; the server keeps them in memory only, for at most a week.
  app.get<{ Params: { teamId: string } }>(
    "/v1/teams/:teamId",
    { schema: { params: { type: "object", required: ["teamId"], properties: { teamId } } } },
    async (req, reply) => {
      try {
        return teams.get(req.params.teamId);
      } catch (err) {
        if (err instanceof NoSuchTeamError) return reply.code(404).send({ error: "no-team", message: err.message });
        throw err;
      }
    },
  );

  app.put<{ Params: { teamId: string; memberId: string }; Body: { token: string; blob: string; create?: boolean } }>(
    "/v1/teams/:teamId/members/:memberId",
    {
      bodyLimit: MAX_BLOB_CHARS + 1000,
      schema: {
        params: teamParams,
        body: {
          type: "object",
          required: ["token", "blob"],
          additionalProperties: false,
          properties: {
            token,
            blob: { type: "string", minLength: 1, maxLength: MAX_BLOB_CHARS },
            // Only "Start a team" sends this: joining never makes a team.
            create: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        return teams.put(req.params.teamId, req.params.memberId, req.body.token, req.body.blob, req.body.create === true);
      } catch (err) {
        if (err instanceof NoSuchTeamError) return reply.code(404).send({ error: "no-team", message: err.message });
        if (err instanceof TeamTokenError) return reply.code(403).send({ error: "not-yours", message: err.message });
        if (err instanceof TeamFullError) return reply.code(429).send({ error: "team-full", message: err.message });
        throw err;
      }
    },
  );

  app.delete<{ Params: { teamId: string; memberId: string }; Body: { token: string } }>(
    "/v1/teams/:teamId/members/:memberId",
    {
      schema: {
        params: teamParams,
        body: { type: "object", required: ["token"], additionalProperties: false, properties: { token } },
      },
    },
    async (req, reply) => {
      try {
        teams.remove(req.params.teamId, req.params.memberId, req.body.token);
        return { ok: true };
      } catch (err) {
        if (err instanceof TeamTokenError) return reply.code(403).send({ error: "not-yours", message: err.message });
        throw err;
      }
    },
  );

  return app;
}
