import type { SearchResult } from "./engine";

/**
 * The caution shown with a destination that isn't the door itself: a
 * postcode's centre when an address was asked for. (A house number found only
 * as its road says ROAD on the result; no caution on the route panel.)
 */
export function destinationNote(r: Pick<SearchResult, "label" | "kind" | "precision">): string | undefined {
  if (r.precision === "postcode" && r.kind !== "postcode")
    return "The postcode, which may cover several doors.";
  // A number OpenStreetMap doesn't have, placed between the doors either side (server).
  if (/\(estimated (between|next to) /.test(r.label)) return "Worked out from the doors either side: check the number when you get there.";
  return undefined;
}
