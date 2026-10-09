// Vitest global setup: builds tiles for the synthetic network and runs a
// real Valhalla server on them for the integration tests.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TestProject } from "vitest/node";

const here = dirname(fileURLToPath(import.meta.url));
const workDir = join(here, "..", ".valhalla");
const python = process.env.VALHALLA_PYTHON ?? "python3";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

export default async function setup(project: TestProject) {
  const build = spawnSync(python, [join(here, "..", "fixtures", "build_tiles.py"), workDir], {
    cwd: join(here, "..", "fixtures"),
    encoding: "utf8",
  });
  if (build.status !== 0) {
    throw new Error(
      `Couldn't build the Valhalla test tiles with ${python}.\n` +
        `Install the tools with: pip install pyvalhalla==3.9.1 osmium\n` +
        `(or point VALHALLA_PYTHON at a Python that has them)\n\n${build.stderr}`,
    );
  }
  const serviceBin = build.stdout.trim().split("\n").pop()!;

  const port = await freePort();
  const configPath = join(workDir, "valhalla.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.httpd.service.listen = `tcp://127.0.0.1:${port}`;
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  const service: ChildProcess = spawn(serviceBin, [configPath, "1"], { stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${url}/status`)).ok) break;
    } catch {
      // not up yet
    }
    if (i > 100) throw new Error("Valhalla test server didn't start");
    await new Promise((r) => setTimeout(r, 100));
  }

  project.provide("valhallaUrl", url);
  project.provide("points", JSON.parse(readFileSync(join(workDir, "points.json"), "utf8")));

  return () => {
    service.kill("SIGKILL");
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    valhallaUrl: string;
    points: Record<string, { lat: number; lng: number }>;
  }
}
