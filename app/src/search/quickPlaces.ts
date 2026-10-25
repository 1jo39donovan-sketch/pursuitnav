// One tap from Search: the nearest A&E, and for the crew's service the
// nearest custody suite (police) or station, from where the phone is now.
import { CUSTODY_SUITES, custodyStation } from "../area/custody";
import { distanceM } from "../geo";
import type { ServiceType } from "../vehicles";
import type { PointOfInterest } from "./places";

export interface QuickPlace {
  /** "Nearest A&E" */
  label: string;
  place: PointOfInterest;
  metres: number;
}

const STATION: Record<ServiceType, { types: string[]; label: string }> = {
  police: { types: ["Police station"], label: "Nearest police station" },
  ambulance: { types: ["Ambulance station"], label: "Nearest ambulance station" },
  fire: { types: ["Fire station"], label: "Nearest fire station" },
  other: { types: ["Police station", "Ambulance station", "Fire station"], label: "Nearest station" },
};

function nearest(from: { lat: number; lng: number }, list: readonly PointOfInterest[]) {
  let best: { place: PointOfInterest; metres: number } | null = null;
  for (const place of list) {
    const metres = distanceM(from, place);
    if (!best || metres < best.metres) best = { place, metres };
  }
  return best;
}

/** The quick places for the service, nearest first within each kind; none without a position. */
export function quickPlaces(
  service: ServiceType | null,
  from: { lat: number; lng: number } | null,
  pois: readonly PointOfInterest[],
): QuickPlace[] {
  if (!from) return [];
  const out: QuickPlace[] = [];
  const add = (label: string, list: readonly PointOfInterest[]) => {
    const n = nearest(from, list);
    if (n) out.push({ label, ...n });
  };
  add("Nearest A&E", pois.filter((p) => p.type === "Hospital with A&E"));
  // Police, and installs from before the service choice.
  if (service === "police" || service === null) {
    const suites = CUSTODY_SUITES.filter((c) => c.kind === "24/7").flatMap((c) => {
      const station = custodyStation(c, pois);
      return station ? [{ ...station, name: `${c.name} custody` }] : [];
    });
    add("Nearest custody", suites);
  }
  const station = STATION[service ?? "police"];
  add(station.label, pois.filter((p) => station.types.includes(p.type)));
  return out;
}
