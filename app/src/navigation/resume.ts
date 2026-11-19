// The route being driven, kept on the phone so it can be picked up again
// after the app is closed or reloaded mid-job (PM's desk test, 19 Nov: a
// reload showed "No route chosen" and the crew lost their route). Offered as
// one tap, "Resume route to …", never restarted silently; ended routes and
// old ones aren't offered.
import type { RoutePlan } from "../api/routes";
import type { Store } from "../storage/types";
import type { ActiveNavigation, RouteKind } from "./NavigationProvider";

const KEY = "resumeRoute";
/** A route older than this is from another job: not offered. */
export const RESUME_MAX_AGE_MS = 2 * 60 * 60_000;

export interface ResumableRoute {
  kind: RouteKind;
  plan: RoutePlan;
  destination: ActiveNavigation["destination"];
  follow?: ActiveNavigation["follow"];
  /** When it was started, ms. */
  at: number;
}

export function saveResumable(store: Pick<Store, "setSetting">, route: ResumableRoute): void {
  try {
    store.setSetting(KEY, JSON.stringify(route));
  } catch {
    // Storage full or blocked: navigation carries on, it just can't be resumed.
  }
}

export function clearResumable(store: Pick<Store, "setSetting">): void {
  try {
    store.setSetting(KEY, "");
  } catch {
    // As above.
  }
}

/** The route to offer again, or null if there's none, it ended, or it's old. */
export function loadResumable(store: Pick<Store, "getSetting">, now = Date.now()): ResumableRoute | null {
  try {
    const raw = store.getSetting(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<ResumableRoute>;
    const d = r.destination;
    if (
      !r.plan?.standard ||
      !d ||
      typeof d.lat !== "number" ||
      typeof d.lng !== "number" ||
      typeof d.title !== "string" ||
      (r.kind !== "standard" && r.kind !== "police" && r.kind !== "follow") ||
      typeof r.at !== "number" ||
      now - r.at > RESUME_MAX_AGE_MS ||
      r.at > now + 60_000
    )
      return null;
    return r as ResumableRoute;
  } catch {
    return null;
  }
}
