import { describe, expect, it } from "vitest";

import { nextStop, type StopState } from "../stopped";

const run = (speeds: (number | null)[]) => {
  let s: StopState = { stopped: false, slowSince: null };
  return speeds.map((v, i) => (s = nextStop(s, v, i * 1000)).stopped);
};

describe("stopped", () => {
  it("counts as stopped after 4 s nearly still", () => {
    expect(run([5, 0.3, 0.2, 0.1, 0, 0])).toEqual([false, false, false, false, false, true]);
  });

  it("stays stopped creeping forward, and moves on over 2.5 m/s", () => {
    expect(run([0, 0, 0, 0, 0, 1.5, 2, 0.5, 3])).toEqual([false, false, false, false, true, true, true, true, false]);
  });

  it("isn't stopped by slow traffic that keeps moving", () => {
    expect(run([1.5, 1.2, 1.8, 1.1, 1.4, 1.6])).toEqual([false, false, false, false, false, false]);
  });

  it("keeps its state with no speed", () => {
    expect(run([0, 0, 0, 0, 0, null])).toEqual([false, false, false, false, true, true]);
  });
});
