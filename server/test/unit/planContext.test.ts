import { describe, expect, it } from "vitest";

import { AbandonedError, Lanes, planContext } from "../../src/planContext.js";
import { ValhallaClient } from "../../src/valhalla.js";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Valhalla call lanes", () => {
  it("runs at most the slots at once, and lets waiting urgent calls go first", async () => {
    const lanes = new Lanes(1);
    const order: string[] = [];
    const call = (name: string, urgent: boolean) =>
      lanes.run(urgent, async () => {
        order.push(name);
        await wait(5);
      });
    await Promise.all([call("a", false), call("b", false), call("c", false), call("urgent", true)]);
    expect(order).toEqual(["a", "urgent", "b", "c"]);
    expect(lanes.waiting).toBe(0);
  });

  it("doesn't call Valhalla for a request the phone has given up", async () => {
    let calls = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("{}");
    }) as typeof fetch;
    try {
      const client = new ValhallaClient("http://valhalla.test");
      const gone = new AbortController();
      gone.abort();
      await expect(
        planContext.run({ urgent: false, signal: gone.signal }, () =>
          client.route({ costing: { costing: "auto", options: {} }, from: { point: [0, 51] }, to: { point: [0.1, 51] } } as never),
        ),
      ).rejects.toBeInstanceOf(AbandonedError);
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
