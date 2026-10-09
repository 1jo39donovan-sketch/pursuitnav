import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import cors from "@fastify/cors";
import Fastify, { LogController, type FastifyInstance } from "fastify";

import type { ServerConfig } from "./config.js";
import type { LngLat } from "./geo.js";
import { PlacesError, type PlacesClient } from "./places.js";
import { planRoutes } from "./plan.js";
import { ValhallaError, type Router } from "./valhalla.js";

const point = {
  type: "object",
  required: ["lat", "lng"],
  additionalProperties: false,
  properties: {
    lat: { type: "number", minimum: -90, maximum: 90 },
    lng: { type: "number", minimum: -180, maximum: 180 },
  },
} as const;

interface RoutesBody {
  /** heading: direction of travel in degrees, when moving, so the route starts that way. */
  from: { lat: number; lng: number; heading?: number };
  to: { lat: number; lng: number };
}

export function buildApp(config: ServerConfig, router: Router, places?: PlacesClient): FastifyInstance {
  // Requests carry officers' positions and control-room addresses, so the
  // API never logs requests or bodies; only failures, without their payloads.
  const app = Fastify({
    logger: { level: "warn" },
    logController: new LogController({ disableRequestLogging: true }),
  });

  // The phone app doesn't need CORS; the browser preview of the app does.
  // There are no cookies or credentials to protect.
  app.register(cors, { origin: true, methods: ["GET", "POST"] });

  const inBounds = ({ lat, lng }: { lat: number; lng: number }) => {
    const [west, south, east, north] = config.bounds;
    return lng >= west && lng <= east && lat >= south && lat <= north;
  };

  app.get("/health", async () => ({ ok: true }));

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
          },
        },
      },
    },
    async (req, reply) => {
      const { from, to } = req.body;
      if (!inBounds(from) || !inBounds(to)) {
        return reply.code(422).send({ error: "outside-area", message: "Both points must be in the covered area." });
      }
      const toLngLat = (p: { lat: number; lng: number }): LngLat => [p.lng, p.lat];
      try {
        return await planRoutes(router, toLngLat(from), toLngLat(to), config, from.heading);
      } catch (err) {
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
        return reply
          .code(503)
          .send({ error: "addresses-not-configured", message: "Full address search isn't set up on this server." });
      }
      try {
        return { addresses: await places.search(req.body.query) };
      } catch (err) {
        if (err instanceof PlacesError) {
          req.log.error({ status: err.status }, "OS Places error");
          return reply.code(err.status).send({ error: "addresses-unavailable", message: "Address search is unavailable." });
        }
        throw err;
      }
    },
  );

  // Every named place in London for the app's offline place search. Public
  // OpenStreetMap data: the request carries nothing about the officer.
  app.get("/v1/places-data", async (req, reply) => {
    const info = await stat(config.placesFile).catch(() => null);
    if (!info) {
      return reply.code(503).send({ error: "places-not-ready", message: "Place data hasn't been built yet." });
    }
    const etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
    reply.header("etag", etag).header("last-modified", info.mtime.toUTCString()).header("cache-control", "no-cache");
    if (req.headers["if-none-match"] === etag) return reply.code(304).send();
    return reply
      .header("content-type", "text/plain; charset=utf-8")
      .header("content-encoding", "gzip")
      .header("content-length", info.size)
      .send(createReadStream(config.placesFile));
  });

  return app;
}
