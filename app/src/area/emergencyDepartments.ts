// Corrections to OpenStreetMap's A&E data, so Nearest A&E and the map's A&E
// badges are right before the fixes reach OpenStreetMap (docs/AE_AUDIT.md,
// audit of 17 Nov 2026). Applied when the places file is loaded: the
// hospital's type changes, so search, Nearest A&E and the map all agree.
//
// From public knowledge of the region's emergency departments, not an NHS
// feed: to be confirmed by an officer or paramedic before launch. Once
// OpenStreetMap is fixed, an entry here does nothing and can go.
import type { Borough } from "../search/boroughs";
import type { PointOfInterest } from "../search/places";
import { normalise } from "../search/text";

export interface AeCorrection {
  /** Words the hospital's name must contain. */
  match: string;
  borough: Borough;
  /** What it really is. */
  set: "Hospital with A&E" | "Hospital" | "Eye A&E" | "Children's A&E";
  why: string;
}

export const AE_CORRECTIONS: readonly AeCorrection[] = [
  // Emergency departments OpenStreetMap doesn't mark.
  { match: "whittington", borough: "Islington", set: "Hospital with A&E", why: "24/7 emergency department" },
  { match: "west middlesex", borough: "Hounslow", set: "Hospital with A&E", why: "24/7 emergency department" },
  { match: "newham university hospital", borough: "Newham", set: "Hospital with A&E", why: "24/7 emergency department" },
  { match: "queen elizabeth the queen mother", borough: "Thanet", set: "Hospital with A&E", why: "24/7 emergency department (QEQM, Margate)" },
  // Marked as A&E but aren't.
  { match: "nuffield", borough: "Tunbridge Wells", set: "Hospital", why: "private hospital, no emergency department" },
  { match: "estuary view", borough: "Canterbury", set: "Hospital", why: "medical centre with a minor injuries unit" },
  { match: "central middlesex", borough: "Brent", set: "Hospital", why: "A&E closed in 2014; urgent treatment centre" },
  // Specialist emergency departments: shown, but not offered as Nearest A&E.
  { match: "moorfields", borough: "Islington", set: "Eye A&E", why: "eye emergencies only" },
  { match: "evelina", borough: "Lambeth", set: "Children's A&E", why: "children only; adult A&E at St Thomas'" },
];

const HOSPITALS = new Set(["Hospital", "Hospital with A&E", "Clinic", "GP surgery"]);

/** The places with the corrections applied (a new array; the rest unchanged). */
export function withAeCorrections(pois: readonly PointOfInterest[]): PointOfInterest[] {
  const rules = AE_CORRECTIONS.map((c) => ({ ...c, words: normalise(c.match).split(" ") }));
  return pois.map((p) => {
    if (!HOSPITALS.has(p.type)) return p;
    const name = ` ${normalise(p.name)} `;
    const rule = rules.find((r) => r.borough === p.borough && r.words.every((w) => name.includes(` ${w} `)));
    return rule && rule.set !== p.type ? { ...p, type: rule.set } : p;
  });
}
