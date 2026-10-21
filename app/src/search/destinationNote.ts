import type { SearchResult } from "./engine";

/**
 * The caution shown with a destination that isn't the door itself: a house
 * number found only as its road (from the phone's road list, or the server
 * when OpenStreetMap hasn't mapped that number), or a postcode's centre.
 */
export function destinationNote(r: Pick<SearchResult, "label" | "kind" | "precision">): string | undefined {
  // A house number at the start, or after "Flat 3,": "54 Caledonian Road" (not "Caledonian Road, N7").
  const numbered = /(^|,\s*)\d+[a-z]?\s/i.test(r.label) && r.kind !== "postcode";
  if (r.precision === "road" && numbered) {
    return "Routes to a point on the road, not the door. On a long road, check which end the number is.";
  }
  if (r.precision === "postcode" && r.kind !== "postcode")
    return "Routes to the postcode, which may cover several doors.";
  return undefined;
}
