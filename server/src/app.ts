import Fastify, { LogController, type FastifyInstance } from "fastify";

import type { ServerConfig } from "./config.js";
import type { LngLat } from "./geo.js";
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
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}

export function buildApp(config: ServerConfig, router: Router): FastifyInstance {
  // Requests carry officers' positions and control-room addresses, so the
  // API never logs requests or bodies; only failures, without their payloads.
  const app = Fastify({
    logger: { level: "warn" },
    logController: new LogController({ disableRequestLogging: true }),
  });

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
          properties: { from: point, to: point },
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
        return await planRoutes(router, toLngLat(from), toLngLat(to), config);
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

  return app;
}
