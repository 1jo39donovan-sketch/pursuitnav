import type { SearchResult } from "./engine";

/**
 * The caution shown with a destination that isn't the door itself: a
 * postcode's centre when an address was asked for. (A house number found only
 * as its road says ROAD on the result; no caution on the route panel.)
 */
// "54 Caledonian Road", "Flat 3, 54 Caledonian Rd", "12A High Street".
const NUMBERED = /^\s*(?:(?:flat|apartment|unit)\s+\w+,?\s+)?\d{1,4}[a-z]?\b/i;

export function destinationNote(r: Pick<SearchResult, "label" | "kind" | "precision">): string | undefined {
  if (r.precision === "postcode" && r.kind !== "postcode")
    return "The postcode, which may cover several doors.";
  // A number OpenStreetMap doesn't have, placed between the doors either side (server).
  if (/\(estimated (between|next to) /.test(r.label)) return "Worked out from the doors either side: check the number when you get there.";
  // A number typed, but only the road found (OpenStreetMap doesn't have that
  // door, nor enough either side to place it; 18 Nov desk test).
  if (r.precision === "road" && NUMBERED.test(r.label))
    return "Estimated position: that number isn't on the map, so the route goes to the road. Check the number when you get there.";
  return undefined;
}
