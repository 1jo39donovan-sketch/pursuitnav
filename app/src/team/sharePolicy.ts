// When this phone shares its position with the team. The crew chooses (on
// Session): always while BlueRoute is open, only while navigating, or only
// once arrived (on scene). Whatever they choose, by default nobody is shown
// at a police station: officers there aren't on a job, and a team map isn't
// the place to show who's at which nick. Pure, so it can be tested.
//
// Sharing only ever happens while BlueRoute is open on screen: the app has no
// background location, so a locked phone or another app in front shares
// nothing (it fails closed). Colleagues see the last share age out.

export type SharePolicy = "always" | "navigating" | "arrived";

export const SHARE_POLICIES: { id: SharePolicy; label: string; hint: string }[] = [
  { id: "always", label: "Always", hint: "Whenever BlueRoute is open." },
  { id: "navigating", label: "Navigating", hint: "Only while you're navigating to a job." },
  { id: "arrived", label: "On scene", hint: "Only once you're within 150 m of where you navigated to." },
];

/** Within this of the place navigated to counts as on scene. */
export const ON_SCENE_M = 150;
/** Inside this of a police station: hidden. */
export const POLICE_ENTER_M = 75;
/** Hidden until this far from every station, on a good fix: GPS bouncing at the edge doesn't flash you on and off. */
export const POLICE_LEAVE_M = 120;
/** A fix worse than this can't say you've left. */
const CLEAR_FIX_M = 50;

interface Point {
  lat: number;
  lng: number;
}

export function metres(a: Point, b: Point): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * Whether the phone is at a police station now, given whether it was. With no
 * fix (no signal inside a station) it stays as it was.
 */
export function atPoliceStation(
  was: boolean,
  fix: (Point & { accuracy: number | null }) | null,
  stations: readonly Point[],
): boolean {
  if (!fix) return was;
  const nearest = stations.reduce((d, s) => Math.min(d, metres(fix, s)), Infinity);
  if (nearest <= POLICE_ENTER_M) return true;
  if (!was) return false;
  return !(nearest > POLICE_LEAVE_M && (fix.accuracy ?? Infinity) <= CLEAR_FIX_M);
}

export interface ShareInputs {
  policy: SharePolicy;
  /** Battery saver: shares only while navigating, whatever the policy. */
  batterySaver: boolean;
  /** Shares even at a police station (off unless the crew turns it on). */
  shareAtPolice: boolean;
  atPolice: boolean;
  navigating: boolean;
  /** Where the crew last navigated to, while navigating or after. */
  destination: Point | null;
  fix: Point | null;
}

/** Whether to share now, and the reason to show the crew. */
export function shareDecision(i: ShareInputs): { share: boolean; why: string } {
  if (i.atPolice && !i.shareAtPolice) return { share: false, why: "Not sharing: you're at a police station" };
  const policy = i.batterySaver ? "navigating" : i.policy;
  if (policy === "always") return { share: true, why: "Sharing while BlueRoute is open" };
  if (policy === "navigating") {
    return i.navigating
      ? { share: true, why: "Sharing while you navigate" }
      : { share: false, why: i.batterySaver ? "Battery saver: sharing only while navigating" : "Not sharing: only while navigating" };
  }
  const onScene = !!i.fix && !!i.destination && metres(i.fix, i.destination) <= ON_SCENE_M;
  return onScene
    ? { share: true, why: "Sharing: you're on scene" }
    : { share: false, why: "Not sharing: only once on scene" };
}
