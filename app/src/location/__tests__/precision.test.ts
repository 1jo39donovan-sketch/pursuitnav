import { describe, expect, it, vi } from "vitest";

import { holdPrecise, preciseWanted } from "../precision";

// Hoisted above the imports by vitest.
vi.mock("react", () => ({ useEffect: () => {}, useSyncExternalStore: () => false }));

describe("full-precision GPS", () => {
  it("is wanted while any screen holds it, and not after the last lets go", () => {
    expect(preciseWanted()).toBe(false);
    holdPrecise("navigate", true);
    holdPrecise("pursuit", true);
    holdPrecise("navigate", false);
    expect(preciseWanted()).toBe(true);
    holdPrecise("pursuit", false);
    expect(preciseWanted()).toBe(false);
  });
});
