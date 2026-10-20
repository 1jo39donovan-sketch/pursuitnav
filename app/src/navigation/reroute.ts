// What the turn panel says while off route, by how the last re-route went.
import { NoSignalRouteError } from "../api/routes";

/** Why the last re-route failed: no answer in time (no signal), or something else. */
export type RerouteFailure = "no-signal" | "error" | null;

export const rerouteFailure = (err: unknown): RerouteFailure =>
  err instanceof NoSignalRouteError ? "no-signal" : "error";

export function offRouteText(failure: RerouteFailure, retrySeconds: number): { title: string; detail: string } {
  if (failure === "no-signal") {
    return {
      title: "No signal",
      detail: `Route may be stale. Head back to the line; trying again every ${retrySeconds} s.`,
    };
  }
  if (failure === "error") {
    return {
      title: "Off route",
      detail: "Can't get a new route from the server. Head back to the line; trying again.",
    };
  }
  return { title: "Off route", detail: "Finding a new route from here…" };
}
