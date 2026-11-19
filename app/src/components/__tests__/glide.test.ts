import { describe, expect, it, vi } from "vitest";

import { glider, glideMs, JUMP_M, lerpAngle, lerpPose, metresBetween } from "../glide";

describe("the vehicle gliding between fixes", () => {
  it("turns the short way round", () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0);
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0);
    expect(lerpAngle(90, 180, 0.5)).toBeCloseTo(135);
  });

  it("moves part way between two fixes", () => {
    const p = lerpPose({ lng: 0, lat: 51, course: 0 }, { lng: 0.001, lat: 51.001, course: 90 }, 0.5);
    expect(p.lng).toBeCloseTo(0.0005);
    expect(p.lat).toBeCloseTo(51.0005);
    expect(p.course).toBeCloseTo(45);
  });

  it("glides for about the time between fixes, within bounds", () => {
    expect(glideMs(1000)).toBe(1000);
    expect(glideMs(50)).toBe(300);
    expect(glideMs(10_000)).toBe(1500);
  });

  it("draws the first fix, and a far jump, at once; a near one over several frames", () => {
    let t = 0;
    const frames: (() => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (f: () => void) => frames.push(f));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const drawn: { lat: number; done: boolean }[] = [];
    const g = glider((p, done) => drawn.push({ lat: p.lat, done }), () => t);
    g.to({ lng: 0, lat: 51, course: 0 });
    expect(drawn).toEqual([{ lat: 51, done: true }]);
    t = 1000;
    g.to({ lng: 0, lat: 51.0001, course: 0 }); // ~11 m on
    t = 1500;
    frames.shift()!();
    t = 2000;
    frames.shift()!();
    expect(drawn.at(-2)!.lat).toBeCloseTo(51.00005);
    expect(drawn.at(-1)).toEqual({ lat: 51.0001, done: true });
    const far = { lng: 0, lat: 51.01, course: 0 };
    expect(metresBetween({ lng: 0, lat: 51.0001, course: 0 }, far)).toBeGreaterThan(JUMP_M);
    g.to(far);
    expect(drawn.at(-1)).toEqual({ lat: 51.01, done: true });
    vi.unstubAllGlobals();
  });
});
