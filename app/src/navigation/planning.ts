// What to say while the server works out a route, so a slow answer reads as
// "still planning", not as a fault. Pure, so it can be tested.

/** After this long without an answer, say it's still planning. */
export const STILL_PLANNING_MS = 4000;

export type PlanningStage = "routes" | "blue-light" | "reroute";

export function planningText(stage: PlanningStage, elapsedMs: number): string {
  const slow = elapsedMs >= STILL_PLANNING_MS;
  switch (stage) {
    case "routes":
      return slow ? "Still planning… the server is working out the routes." : "Working out routes…";
    case "blue-light":
      return slow
        ? "Still checking the blue-light route…"
        : "Checking for a quicker route using bus lanes and restricted turns…";
    case "reroute":
      return slow ? "Still planning a new route…" : "Finding a new route from here…";
  }
}
