import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { osMapsRoutes, tileAllowed, tileRange } from "../../src/osMaps.js";

const LONDON: [number, number, number, number] = [-0.8, 51.2, 0.6, 51.8];

describe("OS map tiles", () => {
  it("covers London and nowhere else", () => {
    const r = tileRange(LONDON, 16);
    // Charing Cross at zoom 16.
    expect(tileAllowed(LONDON, "Road", 16, 32744, 21793)).toBe(true);
    expect(r.minX).toBeLessThanOrEqual(32744);
    // Edinburgh.
    expect(tileAllowed(LONDON, "Road", 16, 32172, 20206)).toBe(false);
  });

  it("passes on only OpenData zooms and the offered styles", () => {
    expect(tileAllowed(LONDON, "Road", 17, 65489, 43587)).toBe(false);
    expect(tileAllowed(LONDON, "Road", 6, 31, 21)).toBe(false);
    expect(tileAllowed(LONDON, "Outdoor", 16, 32744, 21793)).toBe(false);
    expect(tileAllowed(LONDON, "Light", 16, 32744, 21793)).toBe(true);
    expect(tileAllowed(LONDON, "Road", 16.5, 32744, 21793)).toBe(false);
  });

  it("fetches with the key on the server, caches, and keeps the key out of the answer", async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
    }) as unknown as typeof fetch;
    const app = Fastify();
    osMapsRoutes(app, "secret-key", LONDON, undefined, fake);
    const a = await app.inject("/v1/os-maps/Road/16/32744/21793.png");
    expect(a.statusCode).toBe(200);
    expect(a.headers["content-type"]).toBe("image/png");
    expect(a.headers["cache-control"]).toContain("max-age");
    expect(a.body).not.toContain("secret-key");
    await app.inject("/v1/os-maps/Road/16/32744/21793.png");
    expect(urls).toEqual(["https://api.os.uk/maps/raster/v1/zxy/Road_3857/16/32744/21793.png?key=secret-key"]);
    expect((await app.inject("/v1/os-maps/Road/17/65489/43587.png")).statusCode).toBe(404);
  });

  it("says when it isn't set up, and when OS doesn't answer", async () => {
    const off = Fastify();
    osMapsRoutes(off, undefined, LONDON);
    expect((await off.inject("/v1/os-maps/Road/16/32744/21793.png")).statusCode).toBe(503);
    const down = Fastify();
    osMapsRoutes(down, "k", LONDON, undefined, (async () => new Response("", { status: 401 })) as unknown as typeof fetch);
    expect((await down.inject("/v1/os-maps/Road/16/32744/21793.png")).statusCode).toBe(502);
  });
});
