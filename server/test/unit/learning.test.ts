import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import { LearningStore, type Sample } from "../../src/learning.js";

// 400 m in this many seconds is this many mph.
const at = (mph: number, w = 42, b: Sample["b"] = "day"): Sample => ({ w, m: 400, s: 400 / (mph / 2.23694), b });

describe("LearningStore", () => {
  it("learns a road's median speed only after five drives", () => {
    const store = new LearningStore();
    store.add([at(20), at(22), at(30), at(24)]);
    expect(store.speeds().has(42)).toBe(false);
    store.add([at(26, 42, "night")]);
    expect(store.speeds().get(42)).toBe(24);
  });

  it("ignores speeds that can't be a road's (a stop, a GPS jump)", () => {
    const store = new LearningStore();
    expect(store.add([at(1), at(150), at(25)])).toBe(1);
  });

  it("keeps totals between restarts and writes the file the map build reads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "learned-"));
    const store = new LearningStore(join(dir, "totals.json"));
    store.add([20, 21, 22, 23, 24].map((mph) => at(mph, 7)));
    await store.save(join(dir, "practical_speeds.csv"));
    expect(await readFile(join(dir, "practical_speeds.csv"), "utf8")).toBe("way_id,mph\n7,22\n");
    const again = new LearningStore(join(dir, "totals.json"));
    await again.load();
    expect(again.speeds().get(7)).toBe(22);
  });
});

describe("learning API", () => {
  const config = { bounds: [-1, 51, 1, 52], placesFile: "/nonexistent" } as unknown as ServerConfig;
  const router = { route: async () => ({}) as never, traceEdges: async () => [] };

  it("is refused while learning is switched off", async () => {
    const app = buildApp(config, router);
    const res = await app.inject({ method: "POST", url: "/v1/learn", payload: { segments: [at(20)] } });
    expect(res.statusCode).toBe(404);
  });

  it("takes per-road times and drops anything else sent with them", async () => {
    const seen: Sample[][] = [];
    const store = new (class extends LearningStore {
      add(samples: Sample[]) {
        seen.push(samples);
        return super.add(samples);
      }
    })();
    const app = buildApp(config, router, undefined, undefined, undefined, undefined, store);
    const res = await app.inject({
      method: "POST",
      url: "/v1/learn",
      payload: { segments: [{ ...at(20), lat: 51.5, lng: -0.1 }] },
    });
    expect(res.json()).toEqual({ added: 1 });
    expect(Object.keys(seen[0]![0]!).sort()).toEqual(["b", "m", "s", "w"]);
  });
});
