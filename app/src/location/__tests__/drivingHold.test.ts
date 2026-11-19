import { describe, expect, it } from "vitest";

import { drivingHolds } from "../drivingHold";

function fake(fail = false) {
  const calls: string[] = [];
  return {
    calls,
    service: {
      start: async () => {
        calls.push("start");
        if (fail) throw new Error("not now");
      },
      stop: async () => {
        calls.push("stop");
      },
    },
  };
}

describe("driving service holds", () => {
  it("starts with the first holder and stops with the last", async () => {
    const f = fake();
    const h = drivingHolds(f.service);
    await h.hold("navigate");
    await h.hold("pursuit");
    await h.release("navigate");
    expect(f.calls).toEqual(["start"]);
    await h.release("pursuit");
    expect(f.calls).toEqual(["start", "stop"]);
    expect(h.running).toBe(false);
  });

  it("a quick leave and come back doesn't stop it", async () => {
    const f = fake();
    const h = drivingHolds(f.service);
    void h.hold("navigate");
    void h.release("navigate");
    await h.hold("navigate");
    expect(f.calls.at(-1)).toBe("start");
    expect(h.running).toBe(true);
  });

  it("carries on without it when Android says no", async () => {
    const f = fake(true);
    const h = drivingHolds(f.service);
    await h.hold("navigate");
    expect(h.running).toBe(false);
    await h.release("navigate");
    expect(f.calls).toEqual(["start"]);
  });
});
