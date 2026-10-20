import { describe, expect, it, vi } from "vitest";

import { due, SEND_AFTER_MS } from "../queue";
import type { Sample } from "../timing";

// Hoisted above the imports by Vitest: the queue's storage isn't needed here.
vi.mock("../../storage/store", () => ({ store: { getSetting: () => null, setSetting: () => undefined } }));
vi.mock("../../config", () => ({ API_URL: "" }));

const samples = (n: number, w = 1): Sample[] => Array.from({ length: n }, (_, i) => ({ w: w + i, s: 10, m: 100, b: "day" }));

describe("due", () => {
  const now = 10 * SEND_AFTER_MS;

  it("holds drives back for hours", () => {
    expect(due([{ at: now - 60_000, samples: samples(50) }], now).send).toEqual([]);
  });

  it("waits until there's enough to mix together", () => {
    expect(due([{ at: 0, samples: samples(5) }], now).send).toEqual([]);
  });

  it("sends old drives shuffled together, and keeps recent ones", () => {
    const recent = { at: now - 1000, samples: samples(3, 900) };
    const { send, keep } = due(
      [
        { at: 0, samples: samples(20, 1) },
        { at: 1, samples: samples(20, 100) },
        recent,
      ],
      now,
    );
    expect(send).toHaveLength(40);
    expect(send.map((s) => s.w)).not.toEqual([...samples(20, 1), ...samples(20, 100)].map((s) => s.w));
    expect(keep).toEqual([recent]);
  });
});
