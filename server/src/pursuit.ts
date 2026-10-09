// What pursuit mode needs from the road network: the road the car is on,
// its signed speed limit, and the next junction ahead.
import { bearingDeg, turnAngle, type LngLat } from "./geo.js";
import type { LocatedEdge, Matcher } from "./valhalla.js";

export interface PursuitInfo {
  road: string | null;
  /** From OSM maxspeed only. Null when the road has no limit tagged: never guessed. */
  speedLimitMph: number | null;
  nextJunction: { name: string; distanceM: number } | null;
}

// Look this far ahead for a junction with another named road.
const MAX_LOOKAHEAD_M = 2000;
const MAX_STEPS = 12;
// Roads that count as junctions; driveways, car-park aisles and paths don't.
const JUNCTION_USES = new Set(["road", "ramp", "turn_channel", "bus", "busway", "living_street"]);

export const kphToMph = (kph: number) => Math.round(kph / 1.609344);

const sameRoad = (a: string[], b: string[]) => a.some((n) => b.includes(n));

export async function pursuitInfo(matcher: Matcher, trace: LngLat[], heading?: number): Promise<PursuitInfo> {
  const here = trace[trace.length - 1]!;
  // Direction: the phone's GPS course, else the bearing over the last stretch.
  const prev = trace.length >= 2 ? trace[trace.length - 2]! : undefined;
  const dir = heading ?? (prev ? bearingDeg(prev, here) : undefined);

  const [matched, ahead] = await Promise.all([
    trace.length >= 2 ? matcher.matchRoad(trace) : Promise.resolve(null),
    dir !== undefined ? matcher.locate(here, dir) : Promise.resolve([] as LocatedEdge[]),
  ]);
  const current = pickEdge(ahead, matched?.names, dir);

  const names = matched?.names ?? current?.names ?? [];
  const limitKph = matched ? matched.speedLimitKph : current?.speedLimitKph;
  return {
    road: names[0] ?? null,
    speedLimitMph: limitKph ? kphToMph(limitKph) : null,
    nextJunction: current ? await findJunction(matcher, current, names) : null,
  };
}

/** The edge the car is on: running its way, preferably on the matched road. */
function pickEdge(edges: LocatedEdge[], names: string[] | undefined, dir?: number): LocatedEdge | undefined {
  const drivable = edges.filter((e) => e.car && e.shape.length >= 2);
  const ranked = drivable.sort(
    (a, b) =>
      Number(!!names && sameRoad(b.names, names)) - Number(!!names && sameRoad(a.names, names)) ||
      Math.abs(turnAngle(dir ?? a.heading, a.heading)) - Math.abs(turnAngle(dir ?? b.heading, b.heading)),
  );
  return ranked[0];
}

/**
 * Walks forward along the current road to the first point where another
 * named road meets it. Roads are split into edges at every change of tags,
 * so a node with only the same road on it is passed through.
 */
async function findJunction(
  matcher: Matcher,
  start: LocatedEdge,
  roadNames: string[],
): Promise<{ name: string; distanceM: number } | null> {
  let edge = start;
  let distance = start.lengthM * (1 - start.percentAlong);
  for (let step = 0; step < MAX_STEPS && distance <= MAX_LOOKAHEAD_M; step++) {
    const node = edge.shape[edge.shape.length - 1]!;
    const arriving = bearingDeg(edge.shape[edge.shape.length - 2]!, node);
    const atNode = await matcher.locate(node);
    const others = [
      ...new Set(
        atNode
          .filter((e) => e.car && JUNCTION_USES.has(e.use) && e.names.length && !sameRoad(e.names, roadNames))
          .map((e) => e.names[0]!),
      ),
    ];
    if (others.length) return { name: others.slice(0, 2).join(" / "), distanceM: Math.round(distance) };

    // No other road here: carry on along this one, the way the car is going.
    const onward = atNode
      .filter((e) => e.car && e.percentAlong < 0.01 && e.shape.length >= 2 && (!roadNames.length || sameRoad(e.names, roadNames)))
      .filter((e) => Math.abs(turnAngle(arriving, e.heading)) < 60)
      .sort((a, b) => Math.abs(turnAngle(arriving, a.heading)) - Math.abs(turnAngle(arriving, b.heading)))[0];
    if (!onward) return null; // dead end, or the road ends here
    edge = onward;
    distance += onward.lengthM;
  }
  return null;
}
