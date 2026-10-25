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

/** Hospitals' A&E entrances are usually away from the main door: within this of it, an entrance mapped as A&E counts. */
const AE_ENTRANCE_WITHIN_M = 500;

/**
 * Where to send a crew for a hospital's A&E: its A&E entrance when
 * OpenStreetMap has one close by, else the hospital itself.
 */
export function aeDestination(hospital: PointOfInterest, pois: readonly PointOfInterest[]): PointOfInterest {
  const n = nearest(hospital, pois.filter((p) => p.type === "A&E entrance"));
  return n && n.metres <= AE_ENTRANCE_WITHIN_M
    ? { ...n.place, name: `${hospital.name} (A&E entrance)`, borough: hospital.borough }
    : hospital;
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
  const ae = nearest(from, pois.filter((p) => p.type === "Hospital with A&E"));
  if (ae) {
    const place = aeDestination(ae.place, pois);
    out.push({ label: "Nearest A&E", place, metres: distanceM(from, place) });
  }
  // Police, and installs from before the service choice.
  if (service === "police" || service === null) {
    const suites = CUSTODY_SUITES.filter((c) => c.kind === "24/7").flatMap((c) => {
      const station = custodyStation(c, pois);
      return station ? [{ ...station, name: `${c.name} custody` }] : [];
    });
    add("Nearest custody", suites);
  }
  const station = STATION[service ?? "police"];
  // Not the custody suite again: its police station is already listed.
  const listed = new Set(out.map((q) => `${q.place.lat},${q.place.lng}`));
  add(station.label, pois.filter((p) => station.types.includes(p.type) && !listed.has(`${p.lat},${p.lng}`)));
  return out;
}
