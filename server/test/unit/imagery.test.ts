import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { imageryAllowed, imageryRoutes } from "../../src/imagery.js";

const LONDON: [number, number, number, number] = [-0.8, 51.2, 0.6, 51.8];

describe("satellite imagery tiles", () => {
  it("covers the region at the offered zooms only", () => {
    expect(imageryAllowed(LONDON, 16, 32744, 21793)).toBe(true);
    expect(imageryAllowed(LONDON, 19, 261955, 174349)).toBe(true);
    // Edinburgh, too far out, too close in.
    expect(imageryAllowed(LONDON, 16, 32172, 20206)).toBe(false);
    expect(imageryAllowed(LONDON, 9, 255, 170)).toBe(false);
    expect(imageryAllowed(LONDON, 20, 523910, 348698)).toBe(false);
  });

  it("fetches z/y/x with the key on the server, caches, and keeps the key out of the answer", async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return new Response(new Uint8Array([255, 216, 255]), { status: 200, headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;
    const app = Fastify();
    imageryRoutes(app, "secret-key", LONDON, undefined, fake);
    const a = await app.inject("/v1/imagery/16/32744/21793.jpg");
    expect(a.statusCode).toBe(200);
    expect(a.headers["content-type"]).toBe("image/jpeg");
    expect(a.body).not.toContain("secret-key");
    await app.inject("/v1/imagery/16/32744/21793.jpg");
    expect(urls).toEqual([
      "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/16/21793/32744?token=secret-key",
    ]);
  });

  it("says when it isn't set up, or the key is refused", async () => {
    const off = Fastify();
    imageryRoutes(off, undefined, LONDON);
    expect((await off.inject("/v1/imagery/16/32744/21793.jpg")).statusCode).toBe(503);
    let notSetUp = 0;
    const refused = Fastify();
    imageryRoutes(refused, "k", LONDON, () => notSetUp++, (async () => new Response("", { status: 403 })) as unknown as typeof fetch);
    expect((await refused.inject("/v1/imagery/16/32744/21793.jpg")).statusCode).toBe(503);
    expect(notSetUp).toBe(1);
  });
});
