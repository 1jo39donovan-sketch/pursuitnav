// What to say aloud during turn-by-turn, so the crew can keep their eyes on
// the road. Each turn is called once on the approach and once just before
// it; arrival once. Pure: the screen speaks what this returns.
import { upcomingInstruction, type Progress } from "./progress";

/** Approach call between these distances, then the "now" call. */
const EARLY_MAX_M = 450;
const EARLY_MIN_M = 150;
const NOW_M = 70;

export interface Callout {
  /** Said once per route: remembered so it isn't repeated. */
  key: string;
  text: string;
}

/** "300 yards", "a quarter of a mile", for speaking (UK units, like the screen). */
export function spokenDistance(metres: number): string {
  const miles = metres / 1609.344;
  if (miles >= 0.4) {
    if (miles < 0.65) return "half a mile";
    const n = Math.round(miles * 10) / 10;
    return `${n} mile${n === 1 ? "" : "s"}`;
  }
  if (miles >= 0.2) return "a quarter of a mile";
  const yards = Math.max(50, Math.round((metres * 1.0936) / 50) * 50);
  return `${yards} yards`;
}

/** Lower-case the first letter so it reads on after "In 300 yards, ". */
const continuing = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function nextCallout(progress: Progress, said: ReadonlySet<string>): Callout | null {
  if (progress.arrived) return said.has("arrived") ? null : { key: "arrived", text: "You have arrived." };
  if (!said.has("start")) return { key: "start", text: progress.current.instruction };
  const next = progress.next;
  if (!next) return null;
  const id = `turn:${next.beginShapeIndex}`;
  const d = progress.distanceToNextM;
  const text = upcomingInstruction(next);
  if (d <= NOW_M) {
    return said.has(`${id}:now`) ? null : { key: `${id}:now`, text: `${text}.`.replace(/\.\.$/, ".") };
  }
  if (d <= EARLY_MAX_M && d >= EARLY_MIN_M && !said.has(`${id}:early`)) {
    return { key: `${id}:early`, text: `In ${spokenDistance(d)}, ${continuing(text)}`.replace(/\.?$/, ".") };
  }
  return null;
}
