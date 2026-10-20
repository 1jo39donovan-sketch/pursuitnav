import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import type { Router } from "../../src/valhalla.js";

const content = "#blueroute-places v1 2026-10-09 1\nCoffee Corner||Coffee shop|food|18|5154660|-10350|12 Holloway Road\n";

function appWithFile(path: string) {
  return buildApp({ bounds: [-0.8, 51.2, 0.6, 51.8], placesFile: path } as ServerConfig, {} as Router);
}

describe("GET /v1/places-data", () => {
  it("serves the gzipped places file with an ETag", async () => {
    const dir = mkdtempSync(join(tmpdir(), "places-"));
    const file = join(dir, "places.txt.gz");
    writeFileSync(file, gzipSync(content));
    const app = appWithFile(file);
    const res = await app.inject({ method: "GET", url: "/v1/places-data" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(res.rawPayload).toString()).toBe(content);
    const again = await app.inject({
      method: "GET",
      url: "/v1/places-data",
      headers: { "if-none-match": res.headers.etag as string },
    });
    expect(again.statusCode).toBe(304);
  });

  it("says when the data hasn't been built", async () => {
    const res = await appWithFile("/nonexistent/places.txt.gz").inject({ method: "GET", url: "/v1/places-data" });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("places-not-ready");
  });
});

describe("GET /v1/roads-data", () => {
  it("serves the gzipped road list", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roads-"));
    const file = join(dir, "roads.txt.gz");
    const text = "#blueroute-roads v1 2026-10-20 1\nMutton Place|5|5154460|-14740\n";
    writeFileSync(file, gzipSync(text));
    const app = buildApp({ bounds: [-0.8, 51.2, 0.6, 51.8], placesFile: "/nope", roadsFile: file } as ServerConfig, {} as Router);
    const res = await app.inject({ method: "GET", url: "/v1/roads-data" });
    expect(res.statusCode).toBe(200);
    expect(gunzipSync(res.rawPayload).toString()).toBe(text);
  });

  it("says when the road list hasn't been built", async () => {
    const res = await buildApp({ bounds: [-0.8, 51.2, 0.6, 51.8], placesFile: "/nope" } as ServerConfig, {} as Router).inject({
      method: "GET",
      url: "/v1/roads-data",
    });
    expect(res.statusCode).toBe(503);
  });
});
