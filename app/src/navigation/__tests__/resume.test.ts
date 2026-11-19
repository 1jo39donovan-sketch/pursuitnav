import { describe, expect, it } from "vitest";

import type { RoutePlan } from "../../api/routes";
import { clearResumable, loadResumable, RESUME_MAX_AGE_MS, saveResumable } from "../resume";

const memoryStore = () => {
  const m = new Map<string, string>();
  return { getSetting: (k: string) => m.get(k) ?? null, setSetting: (k: string, v: string) => void m.set(k, v) };
};
const plan = { standard: { shape: [[-0.1, 51.5]], durationS: 300, distanceM: 2000 } } as unknown as RoutePlan;
const destination = { lat: 51.55, lng: -0.11, title: "54 Caledonian Road" };

describe("resuming a route after the app is closed (PM desk test, 19 Nov)", () => {
  it("keeps the route being driven, to offer again", () => {
    const store = memoryStore();
    saveResumable(store, { kind: "police", plan, destination, at: 1_000 });
    expect(loadResumable(store, 1_000 + 60_000)).toMatchObject({ kind: "police", destination });
  });

  it("doesn't offer one that ended, or one from hours ago", () => {
    const store = memoryStore();
    saveResumable(store, { kind: "standard", plan, destination, at: 1_000 });
    expect(loadResumable(store, 1_000 + RESUME_MAX_AGE_MS + 1)).toBeNull();
    clearResumable(store);
    expect(loadResumable(store, 2_000)).toBeNull();
  });

  it("ignores something damaged rather than crash", () => {
    const store = memoryStore();
    store.setSetting("resumeRoute", "{not json");
    expect(loadResumable(store)).toBeNull();
    store.setSetting("resumeRoute", JSON.stringify({ kind: "police", at: Date.now() }));
    expect(loadResumable(store)).toBeNull();
  });
});
