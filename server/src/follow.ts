// Follow-in: the way a colleague drove to a hard-to-find place (the back of an
// estate, a yard, a block reached through another road), from wherever you
// are now. You're routed to the nearest point of their track, then along it
// to where it ends.
//
// Their track is driven as they drove it, so it can use bus lanes or ignore
// turn bans. Those are listed like any blue-light route's, and a track that
// goes the wrong way down a one-way street, or under a limit your vehicle
// can't take, is refused rather than followed.
import { POLICE as TRACE, policeFor, standardFor, type RoadChoice, type VehicleType } from "./costing.js";
import { distanceM, type LngLat } from "./geo.js";
import { NoSafeRouteError, overLimits, type PoliceRoute } from "./plan.js";
import { detectRestrictions } from "./restrictions.js";
import { ARRIVE_TYPES, type Route, type Router } from "./valhalla.js";

export interface FollowPlan {
  route: PoliceRoute;
  /** How far along their track you join it, metres from its start. */
  joinedAtM: number;
}

/** Their track goes the wrong way down a one-way street: not something to follow. */
export class FollowWrongWayError extends Error {
  constructor(message = "Their way in goes against a one-way street, so it isn't offered. Use a normal route to them.") {
    super(message);
  }
}

// Within this of their track, start on it; further, drive to it first.
const ON_TRACK_M = 50;
// Points closer together than this add nothing to the match.
const MIN_GAP_M = 15;
const MAX_POINTS = 300;

export async function planFollow(
  router: Router,
  from: LngLat,
  track: LngLat[],
  opts: { restrictionCheckBudget: number; roads?: RoadChoice },
  heading?: number,
  vehicle: VehicleType = "car",
): Promise<FollowPlan> {
  if (!router.traceRoute) throw new Error("Following a track needs a router that can match tracks.");
  const STANDARD = standardFor(vehicle, opts.roads);

  // Join at their track's nearest point to here, then follow the rest of it.
  let join = 0;
  for (let i = 1; i < track.length; i++) {
    if (distanceM(from, track[i]!) < distanceM(from, track[join]!)) join = i;
  }
  const joinedAtM = track.slice(1, join + 1).reduce((sum, p, i) => sum + distanceM(track[i]!, p), 0);
  const rest = thin(track.slice(join));

  const lead =
    distanceM(from, rest[0]!) > ON_TRACK_M
      ? await router.route({ costing: STANDARD, from: { point: from, heading }, to: { point: rest[0]! } })
      : null;
  // From your position if you're on it already, so the first instruction is yours.
  const followed =
    rest.length >= 2
      ? await router.traceRoute(lead ? rest : [from, ...rest.slice(1)], policeFor(vehicle, opts.roads))
      : null;
  const route = join2(lead, followed);
  if (!route) throw new FollowWrongWayError("You're already where their track ends.");

  const edges = await router.traceEdges(route.shape, TRACE);
  if ((await overLimits(router, route.shape, edges, vehicle)).length) {
    throw new NoSafeRouteError("Their way in has a low bridge, width or weight limit your vehicle can't take.");
  }
  const detection = await detectRestrictions(router, route.shape, edges, opts.restrictionCheckBudget, STANDARD);
  if (detection.restrictions.some((r) => r.kind === "wrong-way")) throw new FollowWrongWayError();
  return {
    route: {
      ...route,
      savingS: 0,
      restrictions: detection.restrictions.map(({ excludePoints: _e, ...r }) => r),
      restrictionsComplete: detection.complete,
    },
    joinedAtM,
  };
}

/** The track without points bunched closer than MIN_GAP_M, at most MAX_POINTS, keeping both ends. */
function thin(track: LngLat[]): LngLat[] {
  const out: LngLat[] = [track[0]!];
  for (const p of track.slice(1, -1)) if (distanceM(out[out.length - 1]!, p) >= MIN_GAP_M) out.push(p);
  if (track.length > 1) out.push(track[track.length - 1]!);
  if (out.length <= MAX_POINTS) return out;
  const step = (out.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => out[Math.round(i * step)]!);
}

/** One route: the drive to their track, then along it. */
function join2(lead: Route | null, followed: Route | null): Route | null {
  if (!lead || !followed) return lead ?? followed;
  const offset = lead.shape.length - 1;
  return {
    durationS: lead.durationS + followed.durationS,
    distanceM: lead.distanceM + followed.distanceM,
    shape: [...lead.shape, ...followed.shape.slice(1)],
    maneuvers: [
      ...lead.maneuvers.filter((m) => !ARRIVE_TYPES.has(m.type)),
      ...followed.maneuvers.map((m) => ({
        ...m,
        beginShapeIndex: m.beginShapeIndex + offset,
        endShapeIndex: m.endShapeIndex + offset,
      })),
    ],
  };
}
