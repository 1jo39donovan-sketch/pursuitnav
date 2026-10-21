// What the turn panel says while off route, by how the last re-route went.
import { NoAnswerRouteError, NoSignalRouteError, type RoutePlan } from "../api/routes";
import { planningText } from "./planning";

/**
 * Why the last re-route failed: the network failed (no signal), the server
 * didn't answer in time (no answer), or something else.
 */
export type RerouteFailure = "no-signal" | "no-answer" | "error" | null;

export function rerouteFailure(err: unknown): RerouteFailure {
  if (err instanceof NoSignalRouteError) return "no-signal";
  if (err instanceof NoAnswerRouteError) return "no-answer";
  return "error";
}

export function offRouteText(
  failure: RerouteFailure,
  retrySeconds: number,
  /** How long the current re-route has been waiting, ms (0 if none is). */
  planningMs = 0,
): { title: string; detail: string } {
  if (failure === "no-signal") {
    return {
      title: "No signal",
      detail: `Route may be stale. Head back to the line; trying again every ${retrySeconds} s.`,
    };
  }
  if (failure === "no-answer") {
    return {
      title: "Off route",
      detail: `The server didn't answer in time. Head back to the line; trying again every ${retrySeconds} s.`,
    };
  }
  if (failure === "error") {
    return {
      title: "Off route",
      detail: "Can't get a new route from the server. Head back to the line; trying again.",
    };
  }
  return { title: "Off route", detail: planningText("reroute", planningMs) };
}

/** After a failed re-route (no signal, no answer), wait this long before the next. */
export const RETRY_AFTER_FAILURE_MS = 10_000;
/** After a successful one, the next may start this soon (if still off route). */
export const NEXT_AFTER_SUCCESS_MS = 3000;

/** How the last re-route ended, and when. */
export interface LastReroute {
  at: number;
  ok: boolean;
}

/** May a new re-route start now? A forced one ("Re-route now") never waits. */
export function rerouteAllowed(last: LastReroute | null, now: number, forced = false): boolean {
  if (forced || !last) return true;
  return now - last.at >= (last.ok ? NEXT_AFTER_SUCCESS_MS : RETRY_AFTER_FAILURE_MS);
}

/** checking: the standard route is in, the blue-light one isn't yet. */
export type ReplanStage = "checking" | "done";

/**
 * A blue-light re-route: ask for the quick standard route and the full plan
 * at once, hand over the standard route the moment it's here (stage
 * "checking"), then the full plan (stage "done"). If the full plan fails
 * after the standard route came in, the standard route stands, marked
 * "check-failed". Throws only if neither came back.
 */
export async function policeReroute(
  fetchPlan: (standardOnly: boolean) => Promise<RoutePlan>,
  onPlan: (plan: RoutePlan, stage: ReplanStage) => void,
  aborted: () => boolean = () => false,
): Promise<void> {
  const quick = fetchPlan(true);
  const full = fetchPlan(false);
  let fullDone = false;
  quick
    .then((plan) => {
      if (!fullDone && !aborted()) onPlan(plan, "checking");
    })
    .catch(() => {});
  try {
    const plan = await full;
    fullDone = true;
    if (!aborted()) onPlan(plan, "done");
  } catch (err) {
    fullDone = true;
    const standard = await quick.catch(() => null);
    if (!standard) throw err;
    if (!aborted()) onPlan({ ...standard, noPoliceReason: "check-failed" }, "done");
  }
}
