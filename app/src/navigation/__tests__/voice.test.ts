import { describe, expect, it } from "vitest";

import type { Maneuver } from "../../api/routes";
import type { Progress } from "../progress";
import { nextCallout, promptDistances, spokenDistance, spokenPlace } from "../voice";

const m = (instruction: string, beginShapeIndex: number): Maneuver => ({
  type: 10,
  instruction,
  streetNames: [],
  lengthM: 100,
  timeS: 10,
  beginShapeIndex,
  endShapeIndex: beginShapeIndex + 1,
});

const at = (distanceToNextM: number, arrived = false): Progress =>
  ({
    arrived,
    current: m("Drive north on Holloway Road.", 0),
    next: m("Turn right onto Seven Sisters Road.", 5),
    after: null,
    distanceToNextM,
  }) as unknown as Progress;

/** Plays a drive towards the turn, saying what comes up, as the screen does. */
function drive(distances: number[], speedMs?: number): string[] {
  const said = new Set<string>();
  const out: string[] = [];
  for (const d of distances) {
    const c = nextCallout(at(d), said, undefined, { speedMs });
    if (c) {
      said.add(c.key);
      out.push(c.text);
    }
  }
  return out;
}

describe("calls scaled to speed", () => {
  const mph = (n: number) => n * 0.44704;

  it("keeps town distances at town speeds or when speed is unknown", () => {
    for (const v of [null, 0, mph(20)]) expect(promptDistances(v)).toEqual({ earlyMaxM: 450, earlyMinM: 150, nowM: 70 });
  });

  it("calls the turn seconds ahead when fast", () => {
    const at60 = promptDistances(mph(60));
    expect(at60.nowM).toBeGreaterThan(110); // ~5 s at 60 mph
    expect(at60.earlyMinM).toBeGreaterThan(300);
    expect(at60.earlyMaxM).toBeGreaterThan(750);
  });

  it("never warns absurdly early", () => {
    const at120 = promptDistances(mph(120));
    expect(at120.earlyMaxM).toBeLessThanOrEqual(1300);
    expect(at120.nowM).toBeLessThanOrEqual(250);
    expect(at120.earlyMinM).toBeGreaterThan(at120.nowM);
  });

  it("at 60 mph the warning and the 'now' call come earlier", () => {
    const fast = drive([1500, 900, 700, 500, 300, 200, 150, 100, 60], mph(60));
    expect(fast).toEqual([
      "Drive north on Holloway Road.",
      "In half a mile, turn right onto Seven Sisters Road.",
      "Turn right onto Seven Sisters Road.",
    ]);
    // The "now" call at 100 m, not 60 m as in town.
    const said = new Set(["start", "turn:5:early"]);
    expect(nextCallout(at(100), said, undefined, { speedMs: mph(60) })?.key).toBe("turn:5:now");
    expect(nextCallout(at(100), said)).toBeNull();
  });
});

describe("spoken directions", () => {
  it("says where to start, warns of the turn, then calls it", () => {
    expect(drive([900, 800, 400, 380, 300, 120, 60, 40, 10])).toEqual([
      "Drive north on Holloway Road.",
      "In a quarter of a mile, turn right onto Seven Sisters Road.",
      "Turn right onto Seven Sisters Road.",
    ]);
  });

  it("still calls a turn that comes up too soon for the warning", () => {
    // Too close for "Head along…" first: the first line is the turn's warning.
    expect(drive([100, 50])).toEqual(["In 100 yards, turn right onto Seven Sisters Road.", "Turn right onto Seven Sisters Road."]);
  });

  it("says the destination is ahead, not that you've arrived, before you get there", () => {
    const said = new Set(["start"]);
    const p = { ...at(300), next: { ...m("You have arrived at your destination.", 9), type: 5 } } as unknown as Progress;
    expect(nextCallout(p, said)?.text).toBe("In 350 yards, destination ahead on the right.");
  });

  it("says arrival once", () => {
    const said = new Set(["start"]);
    const first = nextCallout(at(0, true), said)!;
    said.add(first.key);
    expect(first.text).toBe("You have arrived.");
    expect(nextCallout(at(0, true), said)).toBeNull();
  });

  it("speaks distances the way the screen shows them", () => {
    expect(spokenDistance(274)).toBe("300 yards");
    expect(spokenDistance(400)).toBe("a quarter of a mile");
    expect(spokenDistance(800)).toBe("half a mile");
    expect(spokenDistance(1609)).toBe("1 mile");
    expect(spokenDistance(2414)).toBe("1.5 miles");
  });

  it("names the door and the side on the way in and on arrival", () => {
    const said = new Set(["start"]);
    const arrival = { ...m("You have arrived at your destination.", 9), type: 6 };
    const p = { ...at(300), next: arrival } as unknown as Progress;
    expect(nextCallout(p, said, "54 Caledonian Road, N7 8LA")?.text).toBe(
      "In 350 yards, destination ahead on the left: 54 Caledonian Road.",
    );
    const there = { ...at(5, true), current: arrival, next: null } as unknown as Progress;
    expect(nextCallout(there, said, "Flat 3, 54 Caledonian Road")?.text).toBe(
      "You have arrived at Flat 3, 54 Caledonian Road. It's on the left.",
    );
  });

  it("doesn't read out postcodes or map coordinates", () => {
    expect(spokenPlace("54 Caledonian Road, N7 8LA")).toBe("54 Caledonian Road");
    expect(spokenPlace("Point on the map (51.54632, -0.11705)")).toBeNull();
  });
});

describe("prompts that don't cut each other off", () => {
  it("after a re-route says one complete line with the turn, and doesn't repeat it", () => {
    const said = new Set<string>();
    const first = nextCallout(at(140), said, undefined, { rerouted: true })!;
    expect(first.text).toBe("New route. In 150 yards, turn right onto Seven Sisters Road.");
    said.add(first.key);
    first.covers?.forEach((k) => said.add(k));
    expect(nextCallout(at(130), said)).toBeNull();
    // The turn itself is still called, and may cut in.
    expect(nextCallout(at(50), said)).toMatchObject({
      text: "Turn right onto Seven Sisters Road.",
      priority: "urgent",
    });
  });

  it("starts 50 m before a turn by saying the turn, once, not a road name cut off by it (3 Nov)", () => {
    const said = new Set<string>();
    const first = nextCallout(at(50), said)!;
    expect(first).toMatchObject({ key: "start", text: "Turn right onto Seven Sisters Road.", priority: "urgent" });
    said.add(first.key);
    first.covers?.forEach((k) => said.add(k));
    expect(nextCallout(at(30), said)).toBeNull();
    // 120 m away: "In …" as the first line, and the turn itself still called after.
    const later = new Set<string>();
    const start = nextCallout(at(120), later)!;
    expect(start.text).toBe("In 150 yards, turn right onto Seven Sisters Road.");
    later.add(start.key);
    start.covers?.forEach((k) => later.add(k));
    expect(nextCallout(at(100), later)).toBeNull();
    expect(nextCallout(at(50), later)?.text).toBe("Turn right onto Seven Sisters Road.");
  });

  it("starts with the road's name, never a slash", () => {
    const p = {
      ...at(900),
      current: { ...m("Drive northeast on A3.", 0), streetNames: ["A3", "Clapham Road"] },
      next: m("Turn left onto A3/Union Road.", 5),
    } as unknown as Progress;
    expect(nextCallout(p, new Set())?.text).toBe("Head along Clapham Road.");
    expect(nextCallout({ ...p, distanceToNextM: 300 } as Progress, new Set(["start"]))?.text).toBe(
      "In 350 yards, turn left onto Union Road.",
    );
  });
});
