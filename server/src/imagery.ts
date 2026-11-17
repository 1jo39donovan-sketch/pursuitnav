// Satellite imagery for the app's "Satellite" map style (roads and street
// names drawn over it), through the server so Esri never sees the phone and
// a key never ships in the app. Esri World Imagery: from its public service
// with no key, or, once IMAGERY_KEY is set, an ArcGIS Location Platform key
// (free up to 2 million tiles a month; Esri's terms expect an account for
// use in an app, so set one before the stores). IMAGERY=0 turns it off.
// Only tiles over the region are fetched. Like every request, a tile
// request (which says roughly where the officer is looking) isn't logged or
// kept beyond a small in-memory cache.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { tileRange } from "./osMaps.js";

export const IMAGERY_MIN_ZOOM = 10;
export const IMAGERY_MAX_ZOOM = 19;
export const IMAGERY_ATTRIBUTION = "Powered by Esri. Imagery: Esri, Maxar, Earthstar Geographics and the GIS User Community";

const ESRI_KEYED_URL = "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile";
const ESRI_PUBLIC_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";

/** Where a tile comes from: with the key if there is one, else Esri's public service. Esri's path is z/y/x. */
export function imageryUrl(key: string | undefined, z: number, x: number, y: number): string {
  return key
    ? `${ESRI_KEYED_URL}/${z}/${y}/${x}?token=${encodeURIComponent(key)}`
    : `${ESRI_PUBLIC_URL}/${z}/${y}/${x}`;
}
// About 40 KB a tile.
const CACHE_TILES = 400;
const DAY_S = 86_400;

/** Whether an imagery tile may be passed on: a zoom offered, over the region. */
export function imageryAllowed(bounds: [number, number, number, number], z: number, x: number, y: number) {
  if (!Number.isInteger(z) || z < IMAGERY_MIN_ZOOM || z > IMAGERY_MAX_ZOOM) return false;
  const r = tileRange(bounds, z);
  return Number.isInteger(x) && Number.isInteger(y) && x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
}

export function imageryRoutes(
  app: FastifyInstance,
  /** false: turned off (IMAGERY=0). */
  enabled: boolean,
  key: string | undefined,
  bounds: [number, number, number, number],
  notSetUp: (req: FastifyRequest) => void = () => {},
  fetchTile: typeof fetch = fetch,
) {
  const cache = new Map<string, { body: Buffer; type: string }>();
  let lastFailure: number | string | null = null;
  const send = (reply: FastifyReply, t: { body: Buffer; type: string }) =>
    reply.header("content-type", t.type).header("cache-control", `public, max-age=${7 * DAY_S}`).send(t.body);

  app.get<{ Params: { z: string; x: string; y: string } }>("/v1/imagery/:z/:x/:y.jpg", async (req, reply) => {
    if (!enabled) {
      notSetUp(req);
      return reply.code(503).send({ error: "imagery-not-configured" });
    }
    const [z, x, y] = [Number(req.params.z), Number(req.params.x), Number(req.params.y)];
    if (!imageryAllowed(bounds, z, x, y)) return reply.code(404).send({ error: "no-tile" });
    const id = `${z}/${x}/${y}`;
    const hit = cache.get(id);
    if (hit) {
      cache.delete(id);
      cache.set(id, hit);
      return send(reply, hit);
    }
    const res = await fetchTile(imageryUrl(key, z, x, y), {
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res?.ok) {
      const status = res?.status ?? "no answer";
      // Said once per change, not per tile: no URL, so no key, in the log.
      if (status !== lastFailure) req.log.warn({ status }, "Imagery tile failed");
      lastFailure = status;
      if (status === 401 || status === 403) {
        notSetUp(req);
        return reply.code(503).send({ error: "imagery-not-configured" });
      }
      return reply.code(502).send({ error: "imagery-unavailable" });
    }
    lastFailure = null;
    const tile = { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "image/jpeg" };
    cache.set(id, tile);
    if (cache.size > CACHE_TILES) cache.delete(cache.keys().next().value!);
    return send(reply, tile);
  });
}
