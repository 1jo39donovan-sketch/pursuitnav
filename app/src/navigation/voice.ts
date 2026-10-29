// What to say aloud during turn-by-turn, so the crew can keep their eyes on
// the road. Each turn is called once on the approach and once just before
// it; arrival once. Pure: the screen speaks what this returns.
import type { Maneuver } from "../api/routes";
import { upcomingInstruction, type Progress } from "./progress";
import { speakable, startPrompt } from "./spokenText";

/** Approach call between these distances, then the "now" call. */
const EARLY_MAX_M = 450;
const EARLY_MIN_M = 150;
const NOW_M = 70;

export interface Callout {
  /** Said once per route: remembered so it isn't repeated. */
  key: string;
  /** Other calls this one covers, so they aren't said straight after it. */
  covers?: string[];
  text: string;
  /** "urgent" (turn now, arrived) may cut in; the rest wait their turn. */
  priority: "urgent" | "normal";
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

/** Valhalla's arrival manoeuvre types, by the side the destination is on. */
const ARRIVAL_SIDE: Record<number, "right" | "left" | null> = { 4: null, 5: "right", 6: "left" };

/** Which side of the road the destination is on, from the route's last manoeuvre. */
export function arrivalSide(maneuvers: readonly { type: number }[]): "right" | "left" | null {
  return ARRIVAL_SIDE[maneuvers.at(-1)?.type ?? -1] ?? null;
}

/**
 * The destination as it's said: the address without its postcode or
 * "Point on the map" coordinates, which nobody wants read out.
 */
export function spokenPlace(title: string | undefined): string | null {
  if (!title || /^Point on the map/.test(title)) return null;
  return title.replace(/,?\s*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, "").trim() || null;
}

/** The next manoeuvre as said and shown; the arrival names the address ("Destination ahead on the left: 54 Caledonian Road"). */
export function instructionWithPlace(m: Maneuver, title?: string): string {
  const place = spokenPlace(title);
  return m.type in ARRIVAL_SIDE && place ? `${upcomingInstruction(m)}: ${place}` : upcomingInstruction(m);
}

export function nextCallout(
  progress: Progress,
  said: ReadonlySet<string>,
  title?: string,
  /** rerouted: a new route after leaving the old one, said as one line ("New route. Turn right onto Union Road."). */
  opts: { rerouted?: boolean; towards?: string | null } = {},
): Callout | null {
  const place = spokenPlace(title);
  if (progress.arrived) {
    if (said.has("arrived")) return null;
    const side = ARRIVAL_SIDE[progress.current.type] ?? ARRIVAL_SIDE[progress.next?.type ?? -1] ?? null;
    return {
      key: "arrived",
      text: speakable(`You have arrived${place ? ` at ${place}` : ""}${side ? `. It's on the ${side}` : ""}.`),
      priority: "urgent",
    };
  }
  const next = progress.next;
  const id = next ? `turn:${next.beginShapeIndex}` : "";
  const d = progress.distanceToNextM;
  // The last call before arriving says which side and the address, door number and all.
  const text = next ? speakable(instructionWithPlace(next, title)) : "";
  if (!said.has("start")) {
    if (opts.rerouted && next) {
      // One complete line, with the turn, rather than "Re-routing" cut off by the next prompt.
      const turn = d <= NOW_M ? text : `In ${spokenDistance(d)}, ${continuing(text)}`;
      return {
        key: "start",
        covers: [d <= NOW_M ? `${id}:now` : `${id}:early`],
        text: `New route. ${turn}`.replace(/\.?$/, "."),
        priority: "normal",
      };
    }
    return {
      key: "start",
      text: startPrompt(progress.current.streetNames, progress.current.instruction, opts.towards),
      priority: "normal",
    };
  }
  if (!next) return null;
  if (d <= NOW_M) {
    return said.has(`${id}:now`)
      ? null
      : { key: `${id}:now`, text: `${text}.`.replace(/\.\.$/, "."), priority: "urgent" };
  }
  if (d <= EARLY_MAX_M && d >= EARLY_MIN_M && !said.has(`${id}:early`)) {
    return {
      key: `${id}:early`,
      text: `In ${spokenDistance(d)}, ${continuing(text)}`.replace(/\.?$/, "."),
      priority: "normal",
    };
  }
  return null;
}
