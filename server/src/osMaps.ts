// Ordnance Survey's road map for the app's "OS" map style, through the
// server so the OS key never ships in the app. Only OS OpenData zooms are
// passed on (free under the Open Government Licence); closer zooms are OS
// Premium and charged, so they're refused and the app draws the zoom-16
// tiles larger. Only tiles over the region are fetched, so the key can't be
// used for the rest of the country. Like every request, a tile request (which
// says roughly where the officer is looking) isn't logged or kept.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** OS Maps API styles offered, in Web Mercator. */
export const OS_STYLES = ["Road", "Light"] as const;
/** OpenData zooms of the OS Maps API in Web Mercator; 17–20 are Premium. */
export const OS_MIN_ZOOM = 7;
export const OS_MAX_ZOOM = 16;

const OS_TILE_URL = "https://api.os.uk/maps/raster/v1/zxy";
// About 20 KB a tile: a few minutes of driving for several phones, in memory.
const CACHE_TILES = 600;
const DAY_S = 86_400;

/** The tile's x and y range covering [west, south, east, north] at zoom z. */
export function tileRange(bounds: [number, number, number, number], z: number) {
  const n = 2 ** z;
  const x = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const y = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const [west, south, east, north] = bounds;
  return { minX: x(west), maxX: x(east), minY: y(north), maxY: y(south) };
}

/** Whether a tile may be passed on: an offered style, an OpenData zoom, over the region. */
export function tileAllowed(bounds: [number, number, number, number], style: string, z: number, x: number, y: number) {
  if (!(OS_STYLES as readonly string[]).includes(style)) return false;
  if (!Number.isInteger(z) || z < OS_MIN_ZOOM || z > OS_MAX_ZOOM) return false;
  const r = tileRange(bounds, z);
  return Number.isInteger(x) && Number.isInteger(y) && x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
}

export function osMapsRoutes(
  app: FastifyInstance,
  key: string | undefined,
  bounds: [number, number, number, number],
  /** Marks a "not set up here" answer, so it isn't counted as a server error. */
  notSetUp: (req: FastifyRequest) => void = () => {},
  fetchTile: typeof fetch = fetch,
) {
  // Most recently used last; a Map keeps insertion order.
  const cache = new Map<string, Buffer>();
  const send = (reply: FastifyReply, png: Buffer) =>
    reply.header("content-type", "image/png").header("cache-control", `public, max-age=${7 * DAY_S}`).send(png);

  app.get<{ Params: { style: string; z: string; x: string; y: string } }>(
    "/v1/os-maps/:style/:z/:x/:y.png",
    async (req, reply) => {
      if (!key) {
        notSetUp(req);
        return reply.code(503).send({ error: "os-maps-not-configured" });
      }
      const { style } = req.params;
      const [z, x, y] = [Number(req.params.z), Number(req.params.x), Number(req.params.y)];
      if (!tileAllowed(bounds, style, z, x, y)) return reply.code(404).send({ error: "no-tile" });
      const id = `${style}/${z}/${x}/${y}`;
      const hit = cache.get(id);
      if (hit) {
        cache.delete(id);
        cache.set(id, hit);
        return send(reply, hit);
      }
      const res = await fetchTile(`${OS_TILE_URL}/${style}_3857/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}`, {
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (!res?.ok) {
        // The key's status, not the tile: no URL, so no key, in the log.
        req.log.warn({ status: res?.status ?? "no answer" }, "OS Maps tile failed");
        return reply.code(502).send({ error: "os-maps-unavailable" });
      }
      const png = Buffer.from(await res.arrayBuffer());
      cache.set(id, png);
      if (cache.size > CACHE_TILES) cache.delete(cache.keys().next().value!);
      return send(reply, png);
    },
  );
}
