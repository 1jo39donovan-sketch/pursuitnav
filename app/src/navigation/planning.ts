// What to say while the server works out a route, so a slow answer reads as
// "still planning", not as a fault. Pure, so it can be tested.

/** After this long without an answer, say it's still planning. */
export const STILL_PLANNING_MS = 4000;

export type PlanningStage = "routes" | "blue-light" | "reroute";

export function planningText(stage: PlanningStage, elapsedMs: number): string {
  return `${words(stage, elapsedMs >= STILL_PLANNING_MS)}${seconds(elapsedMs)}`;
}

function words(stage: PlanningStage, slow: boolean): string {
  switch (stage) {
    case "routes":
      return slow ? "Still planning… working out the standard route" : "Working out the standard route…";
    case "blue-light":
      return slow
        ? "Still checking the blue-light route…"
        : "Checking for a quicker route using bus lanes and restricted turns…";
    case "reroute":
      return slow ? "Still planning a new route…" : "Finding a new route from here…";
  }
}

/** The seconds waited, from the first: something visibly happening. */
const seconds = (ms: number) => (ms >= 1000 ? ` ${Math.floor(ms / 1000)} s` : "");
