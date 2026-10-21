import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import { dataRelease, machineMemory } from "../../src/serverInfo.js";
import type { Router } from "../../src/valhalla.js";

describe("server info", () => {
  it("reads the live data release beside the places file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "release-"));
    expect(await dataRelease(join(dir, "places.txt.gz"))).toBeUndefined();
    writeFileSync(
      join(dir, "data-release.json"),
      JSON.stringify({ release: "data-20261101-0100", built: "2026-11-01T02:10:00Z", files: [] }),
    );
    expect(await dataRelease(join(dir, "places.txt.gz"))).toEqual({
      release: "data-20261101-0100",
      built: "2026-11-01T02:10:00Z",
    });
    const res = await buildApp(
      {
        bounds: [-1, 51, 1, 52],
        valhallaUrl: "http://127.0.0.1:1",
        placesFile: join(dir, "places.txt.gz"),
      } as ServerConfig,
      {} as Router,
    ).inject({ method: "GET", url: "/health" });
    expect(res.json().data).toEqual({ release: "data-20261101-0100", built: "2026-11-01T02:10:00Z" });
  });

  it("reports the machine's memory in MB", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "mem-")), "meminfo");
    writeFileSync(
      file,
      "MemTotal:        3907584 kB\nMemFree:          204800 kB\nMemAvailable:    1859584 kB\nSwapTotal:       4194300 kB\nSwapFree:        4092924 kB\n",
    );
    expect(await machineMemory(file)).toEqual({ totalMB: 3816, usedMB: 2000, swapUsedMB: 99 });
    expect(await machineMemory("/nonexistent")).toBeUndefined();
  });
});
