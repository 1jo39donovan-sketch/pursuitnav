// What the turn panel says while off route, by how the last re-route went.
import { NoAnswerRouteError, NoSignalRouteError } from "../api/routes";
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
