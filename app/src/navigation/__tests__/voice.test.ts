import { describe, expect, it } from "vitest";

import type { Maneuver } from "../../api/routes";
import type { Progress } from "../progress";
import { nextCallout, spokenDistance } from "../voice";

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
function drive(distances: number[]): string[] {
  const said = new Set<string>();
  const out: string[] = [];
  for (const d of distances) {
    const c = nextCallout(at(d), said);
    if (c) {
      said.add(c.key);
      out.push(c.text);
    }
  }
  return out;
}

describe("spoken directions", () => {
  it("says where to start, warns of the turn, then calls it", () => {
    expect(drive([900, 800, 400, 380, 300, 120, 60, 40, 10])).toEqual([
      "Drive north on Holloway Road.",
      "In a quarter of a mile, turn right onto Seven Sisters Road.",
      "Turn right onto Seven Sisters Road.",
    ]);
  });

  it("still calls a turn that comes up too soon for the warning", () => {
    expect(drive([100, 50])).toEqual(["Drive north on Holloway Road.", "Turn right onto Seven Sisters Road."]);
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
});
