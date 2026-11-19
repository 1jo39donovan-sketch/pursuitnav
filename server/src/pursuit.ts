// What pursuit mode needs from the road network: the road the car is on,
// its signed speed limit, and the next junction ahead.
import { bearingDeg, turnAngle, type LngLat } from "./geo.js";
import type { LocatedEdge, Matcher } from "./valhalla.js";

export interface PursuitInfo {
  road: string | null;
  /** From OSM maxspeed only. Null when the road has no limit tagged: never guessed. */
  speedLimitMph: number | null;
  nextJunction: { name: string; distanceM: number } | null;
  /**
   * The stretch of road the car is on, in the way it's going ([lng, lat]
   * points, 5 decimals): the app draws the car on it, so the arrow sits on the
   * road rather than wherever GPS drift puts it. Null when the road isn't known.
   */
  roadShape: LngLat[] | null;
}

// Look this far ahead for a junction with another named road.
const MAX_LOOKAHEAD_M = 2000;
// Roads are drawn in short pieces (a crossing, a bus stop, a change of
// surface each start a new one): Crowndale Road took 12 in its first 130 m.
const MAX_STEPS = 40;
// Roads that count as junctions; driveways, car-park aisles and paths don't.
const JUNCTION_USES = new Set(["road", "ramp", "turn_channel", "bus", "busway", "living_street"]);

export const kphToMph = (kph: number) => Math.round(kph / 1.609344);

/** A road number such as A1, A503, B550, M25 or A40(M): OSM gives it alongside the name, in either order. */
const ROAD_NUMBER = /^[ABM]\d+(\(M\))?$/i;

/**
 * Whether two lists of names are the same road. By name when both have one:
 * different roads share a number (City Road and Old Street Roundabout are
 * both A501, Crowndale Road and Pancras Road both A5202), and a shared
 * number hid the junction (19 Nov). By number only when one has no name.
 */
const sameRoad = (a: string[], b: string[]) => {
  const named = (x: string[]) => x.filter((n) => !ROAD_NUMBER.test(n.trim()));
  const [na, nb] = [named(a), named(b)];
  if (na.length && nb.length) return na.some((n) => nb.includes(n));
  return a.some((n) => b.includes(n));
};

export async function pursuitInfo(
  matcher: Matcher,
  trace: LngLat[],
  heading?: number,
  /** Says each step of the junction search (the debug script only). */
  log?: (line: string) => void,
): Promise<PursuitInfo> {
  const here = trace[trace.length - 1]!;
  // Direction: the phone's GPS course, else the bearing over the last stretch.
  const prev = trace.length >= 2 ? trace[trace.length - 2]! : undefined;
  const dir = heading ?? (prev ? bearingDeg(prev, here) : undefined);

  const [matched, ahead] = await Promise.all([
    trace.length >= 2 ? matcher.matchRoad(trace) : Promise.resolve(null),
    dir !== undefined ? matcher.locate(here, dir) : Promise.resolve([] as LocatedEdge[]),
  ]);
  // Valhalla snaps to the nearest road only: by an unnamed service road (on
  // Holloway Road, 19 Nov) the car's direction then matched nothing, and no
  // junction was ever looked for. Look again within 30 m on public roads,
  // then without the direction, and take the edge running the car's way.
  let located = ahead;
  if (dir !== undefined && !located.some((e) => e.car)) {
    located = await matcher.locate(here, dir, { radiusM: 30, publicRoads: true });
    if (!located.some((e) => e.car)) located = await matcher.locate(here, undefined, { radiusM: 30, publicRoads: true });
  }
  const current = pickEdge(located, matched?.names, dir);

  // Matching can come back with no road (a fix between roads): then the road
  // found under the car, so the road shows and isn't named as its own junction.
  const useMatched = !!matched?.names.length;
  const names = useMatched ? matched!.names : (current?.names ?? []);
  const limitKph = useMatched ? matched!.speedLimitKph : current?.speedLimitKph;
  return {
    road: roadLabel(names),
    speedLimitMph: limitKph ? kphToMph(limitKph) : null,
    nextJunction: current ? await findJunction(matcher, current, names, log) : null,
    // Only an edge on the matched road: a side road's shape would pull the arrow off.
    roadShape:
      current && (!matched || sameRoad(current.names, matched.names))
        ? current.shape.map(([lng, lat]) => [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5] as LngLat)
        : null,
  };
}

/** The road's name rather than its number, when it has one: "Holloway Road", not "A1". */
export function streetName(names: readonly string[]): string | null {
  return names.find((n) => !ROAD_NUMBER.test(n.trim())) ?? names[0] ?? null;
}

/** The road as the crew says it: "Holloway Road / A1", or the name or number alone. */
export function roadLabel(names: readonly string[]): string | null {
  const name = names.find((n) => !ROAD_NUMBER.test(n.trim()));
  const number = names.find((n) => ROAD_NUMBER.test(n.trim()));
  const ref = number?.toUpperCase();
  if (name && ref) return `${name} / ${ref}`;
  return name ?? ref ?? null;
}

/** The edge the car is on: running its way, preferably on the matched road. */
function pickEdge(edges: LocatedEdge[], names: string[] | undefined, dir?: number): LocatedEdge | undefined {
  // Never one running against the car (the other carriageway, or the way back).
  const drivable = edges.filter(
    (e) => e.car && e.shape.length >= 2 && (dir === undefined || Math.abs(turnAngle(dir, e.heading)) < 90),
  );
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
  log: (line: string) => void = () => {},
): Promise<{ name: string; distanceM: number } | null> {
  let edge = start;
  let distance = start.lengthM * (1 - start.percentAlong);
  for (let step = 0; step < MAX_STEPS && distance <= MAX_LOOKAHEAD_M; step++) {
    const node = edge.shape[edge.shape.length - 1]!;
    const arriving = bearingDeg(edge.shape[edge.shape.length - 2]!, node);
    const atNode = await matcher.locate(node);
    // Valhalla snaps a point within 5 m to a node: at the end of a very short
    // stretch it can answer for the node behind (Holloway Road, 19 Nov), and
    // the search went round in circles. Then look a little further on instead.
    const startsHere = atNode.filter((e) => e.percentAlong < 0.01 && e.shape.length >= 2 && near(e.shape[0]!, node));
    log(
      `step ${step} node ${node[1].toFixed(5)},${node[0].toFixed(5)} at ${Math.round(distance)} m, arriving ${Math.round(arriving)}: ` +
        atNode
          .map((e) => `${e.names.join("/") || "-"}[${e.use}${e.car ? "" : ",no car"} hdg ${Math.round(e.heading)} along ${e.percentAlong.toFixed(2)}${startsHere.includes(e) ? " starts" : ""}]`)
          .join(" "),
    );
    if (!startsHere.length) {
      const beyond = await matcher.locate(projectM(node, arriving, SNAP_STEP_M), arriving);
      const next = beyond
        .filter((e) => e.car && e.shape.length >= 2)
        .sort(
          (a, b) =>
            Number(!roadNames.length || sameRoad(b.names, roadNames)) - Number(!roadNames.length || sameRoad(a.names, roadNames)) ||
            Math.abs(turnAngle(arriving, a.heading)) - Math.abs(turnAngle(arriving, b.heading)),
        )[0];
      if (!next || Math.abs(turnAngle(arriving, next.heading)) >= 60) return null;
      // The road ahead under another name (Crowndale Road into Pancras Road): that's the junction.
      if (roadNames.length && !sameRoad(next.names, roadNames)) {
        if (!next.names.length || !JUNCTION_USES.has(next.use)) return null;
        return { name: streetName(next.names)!, distanceM: Math.round(distance) };
      }
      edge = next;
      distance += next.lengthM * (1 - next.percentAlong);
      continue;
    }
    const others = [
      ...new Set(
        atNode
          .filter((e) => e.car && JUNCTION_USES.has(e.use) && e.names.length && !sameRoad(e.names, roadNames))
          .map((e) => streetName(e.names)!),
      ),
    ];
    if (others.length) return { name: others.slice(0, 2).join(" / "), distanceM: Math.round(distance) };

    // No other road here: carry on along this one, the way the car is going.
    const onward = startsHere
      .filter((e) => e.car && (!roadNames.length || sameRoad(e.names, roadNames)))
      .filter((e) => Math.abs(turnAngle(arriving, e.heading)) < 60)
      .sort((a, b) => Math.abs(turnAngle(arriving, a.heading)) - Math.abs(turnAngle(arriving, b.heading)))[0];
    if (!onward) return null; // dead end, or the road ends here
    edge = onward;
    distance += onward.lengthM;
  }
  return null;
}

/** Past Valhalla's 5 m node snapping, to read the stretch beyond a very short one. */
const SNAP_STEP_M = 8;
const near = (a: LngLat, b: LngLat) => Math.abs(a[0] - b[0]) < 2e-6 && Math.abs(a[1] - b[1]) < 2e-6;

/** The point `m` metres on from `p` at bearing `deg`. */
function projectM(p: LngLat, deg: number, m: number): LngLat {
  const r = (deg * Math.PI) / 180;
  const dLat = (Math.cos(r) * m) / 111_320;
  const dLng = (Math.sin(r) * m) / (111_320 * Math.cos((p[1] * Math.PI) / 180));
  return [p[0] + dLng, p[1] + dLat];
}
