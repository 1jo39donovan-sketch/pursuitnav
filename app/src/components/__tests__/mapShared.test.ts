import { describe, expect, it } from "vitest";

import { easeBearing } from "../mapShared";

describe("easeBearing", () => {
  it("turns a little towards the new course each frame, the short way round", () => {
    expect(easeBearing(0, 90)).toBeCloseTo(3.6);
    expect(easeBearing(350, 10)).toBeCloseTo(350.8);
    expect(easeBearing(89.8, 90)).toBe(90);
  });
});
