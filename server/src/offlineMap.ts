// The map officers keep on their phones for when there's no signal
// (scripts/offline-map.sh builds it weekly): its manifest, then each file,
// under the build's version so a file never changes under a download that
// resumes. Range requests let a phone carry on a big download where it left
// off. Public OpenStreetMap data; a request carries nothing about the officer.
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { FastifyInstance } from "fastify";

export interface OfflineManifest {
  format: number;
  built: string;
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  styles: Record<string, string>;
  bytes: number;
  files: { path: string; bytes: number; sha256: string }[];
}

/** The manifest as the app gets it: with the version its files are served under. */
export type ServedManifest = OfflineManifest & { version: string; base: string };

const TYPES: Record<string, string> = {
  json: "application/json",
  png: "image/png",
  pbf: "application/x-protobuf",
  pmtiles: "application/octet-stream",
};

export const versionOf = (built: string) => built.replace(/[^0-9A-Za-z]/g, "");

/** bytes=a-b, bytes=a- or bytes=-n for a file of `size`, or null if it can't be served. */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

export function offlineMapRoutes(app: FastifyInstance, dir: string | undefined) {
  // Read again only when the file changes (a weekly swap).
  let cached: { mtimeMs: number; manifest: ServedManifest } | null = null;
  const manifest = async (): Promise<ServedManifest | null> => {
    if (!dir) return null;
    const path = join(dir, "manifest.json");
    const info = await stat(path).catch(() => null);
    if (!info) return null;
    if (cached?.mtimeMs !== info.mtimeMs) {
      const m = JSON.parse(await readFile(path, "utf8")) as OfflineManifest;
      const version = versionOf(m.built);
      cached = { mtimeMs: info.mtimeMs, manifest: { ...m, version, base: `/v1/offline-map/${version}/` } };
    }
    return cached.manifest;
  };

  app.get("/v1/offline-map", async (_req, reply) => {
    const m = await manifest();
    if (!m) return reply.code(503).send({ error: "offline-map-not-ready", message: "The offline map hasn't been built yet." });
    return reply.header("cache-control", "no-cache").send(m);
  });

  app.get<{ Params: { version: string; "*": string } }>("/v1/offline-map/:version/*", async (req, reply) => {
    const m = await manifest();
    if (!m) return reply.code(503).send({ error: "offline-map-not-ready", message: "The offline map hasn't been built yet." });
    // Only files the manifest lists, so nothing else in the folder (or above it) can be asked for.
    const file = m.files.find((f) => f.path === req.params["*"]);
    if (req.params.version !== m.version || !file) {
      return reply.code(404).send({ error: "offline-map-replaced", message: "The offline map has been updated: start again." });
    }
    const path = join(dir!, file.path);
    const size = (await stat(path)).size;
    const ext = file.path.split(".").pop() ?? "";
    reply
      .header("content-type", TYPES[ext] ?? "application/octet-stream")
      .header("accept-ranges", "bytes")
      .header("etag", `"${file.sha256.slice(0, 16)}"`)
      // A version's files never change.
      .header("cache-control", "public, max-age=31536000, immutable");
    const range = req.headers.range;
    if (range) {
      const r = parseRange(range, size);
      if (!r) return reply.code(416).header("content-range", `bytes */${size}`).send();
      return reply
        .code(206)
        .header("content-range", `bytes ${r.start}-${r.end}/${size}`)
        .header("content-length", r.end - r.start + 1)
        .send(createReadStream(path, { start: r.start, end: r.end }));
    }
    return reply.header("content-length", size).send(createReadStream(path));
  });
}
