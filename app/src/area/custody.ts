// Custody suites. London's from the Independent Custody Visitors' public list
// (24/7 suites and contingency suites, Met, BTP and Border Force). Kent's six
// after Maidstone closed on 15 October 2025 (the Kent PCC's count; names from
// the Legal Aid Agency's closure notice and defence guides). Essex's seven
// from Essex Police's FOI list and HMICFRS's 2024 inspection. Each is
// found on the map among OpenStreetMap's police stations in its borough by
// the words in `match`; one that isn't mapped as a police station is searched
// for by name instead, so the app never guesses a building.
import type { Borough } from "../search/boroughs";
import type { PointOfInterest } from "../search/places";
import { normalise } from "../search/text";
import { policeSite } from "./serviceSites";

export interface CustodySuite {
  name: string;
  /** Where the building is (not always the borough whose panel lists it). */
  borough: Borough;
  kind: "24/7" | "contingency";
  agency: "MPS" | "BTP" | "UKBF" | "Kent" | "Essex";
  /** Words a police station's name must contain to be this suite. */
  match: string;
  /** …and must not contain (to tell Wembley from Wembley Park). */
  not?: string;
  /** What to search for when it isn't mapped as a police station. */
  search: string;
}

const s = (
  name: string,
  borough: Borough,
  kind: CustodySuite["kind"],
  agency: CustodySuite["agency"],
  match: string,
  search = `${name} police station`,
  not?: string,
): CustodySuite => ({ name, borough, kind, agency, match, search, ...(not ? { not } : {}) });

export const CUSTODY_SUITES: CustodySuite[] = [
  s("Colindale", "Barnet", "24/7", "MPS", "colindale"),
  s("Wembley", "Brent", "24/7", "MPS", "wembley", undefined, "park"),
  s("Wembley Park", "Brent", "contingency", "BTP", "wembley park"),
  s("Harrow", "Harrow", "24/7", "MPS", "harrow"),
  s("Bromley", "Bromley", "24/7", "MPS", "bromley"),
  s("Holborn", "Camden", "24/7", "MPS", "holborn"),
  s("Kentish Town", "Camden", "contingency", "MPS", "kentish town"),
  s("Tottenham Court Road", "Camden", "contingency", "BTP", "tottenham court"),
  s("Croydon", "Croydon", "24/7", "MPS", "croydon"),
  s("Acton", "Ealing", "24/7", "MPS", "acton"),
  s("Edmonton", "Enfield", "contingency", "MPS", "edmonton"),
  s("Plumstead", "Greenwich", "24/7", "MPS", "plumstead"),
  s("Stoke Newington", "Hackney", "24/7", "MPS", "stoke newington"),
  s("Bethnal Green", "Tower Hamlets", "24/7", "MPS", "bethnal green"),
  s("Wood Green", "Haringey", "24/7", "MPS", "wood green"),
  s("Romford", "Havering", "24/7", "MPS", "romford"),
  s("Ilford", "Redbridge", "24/7", "MPS", "ilford"),
  s("Colnbrook", "Hillingdon", "24/7", "UKBF", "colnbrook", "Colnbrook Immigration Removal Centre"),
  s("Heathrow", "Hillingdon", "24/7", "MPS", "heathrow"),
  s("Hounslow", "Hounslow", "24/7", "MPS", "hounslow"),
  s("Islington", "Islington", "24/7", "MPS", "islington"),
  s("Brewery Lane", "Islington", "24/7", "BTP", "brewery"),
  s("Kingston", "Kingston upon Thames", "24/7", "MPS", "kingston"),
  s("Brixton", "Lambeth", "24/7", "MPS", "brixton"),
  s("Lewisham", "Lewisham", "24/7", "MPS", "lewisham"),
  s("Sutton", "Sutton", "24/7", "MPS", "sutton"),
  s("Forest Gate", "Newham", "24/7", "MPS", "forest gate"),
  s("Fresh Wharf (Barking)", "Barking and Dagenham", "24/7", "MPS", "fresh wharf", "Fresh Wharf Barking police station"),
  s("West Ham", "Newham", "contingency", "BTP", "west ham"),
  s("Walworth Road", "Southwark", "24/7", "MPS", "walworth"),
  s("Peckham", "Southwark", "contingency", "MPS", "peckham"),
  s("Leyton", "Waltham Forest", "24/7", "MPS", "leyton"),
  s("Wandsworth", "Wandsworth", "24/7", "MPS", "wandsworth"),
  s("Belgravia", "Westminster", "24/7", "MPS", "belgravia"),
  s("Charing Cross", "Westminster", "24/7", "MPS", "charing cross"),
  s("West End Central", "Westminster", "contingency", "MPS", "west end central"),
  s("Ebury Bridge", "Westminster", "contingency", "BTP", "ebury"),
  // Kent
  s("Medway", "Medway", "24/7", "Kent", "medway"),
  s("North Kent", "Gravesham", "24/7", "Kent", "north kent", "North Kent police station Northfleet"),
  s("Canterbury", "Canterbury", "24/7", "Kent", "canterbury"),
  s("Tonbridge", "Tonbridge and Malling", "24/7", "Kent", "tonbridge"),
  s("Folkestone", "Folkestone and Hythe", "24/7", "Kent", "folkestone"),
  s("Margate", "Thanet", "24/7", "Kent", "margate"),
  // Essex
  s("Basildon", "Basildon", "24/7", "Essex", "basildon"),
  s("Chelmsford", "Chelmsford", "24/7", "Essex", "chelmsford"),
  s("Clacton", "Tendring", "24/7", "Essex", "clacton"),
  s("Colchester", "Colchester", "24/7", "Essex", "colchester"),
  s("Grays", "Thurrock", "24/7", "Essex", "grays"),
  s("Harlow", "Harlow", "24/7", "Essex", "harlow"),
  s("Southend", "Southend-on-Sea", "24/7", "Essex", "southend"),
];

/** The police station on the map that is this suite, or null if none clearly is. */
export function custodyStation(suite: CustodySuite, places: readonly PointOfInterest[]): PointOfInterest | null {
  const words = normalise(suite.match).split(" ");
  const not = suite.not ? normalise(suite.not) : null;
  const found = places.filter((p) => {
    if (p.type !== "Police station" || p.borough !== suite.borough || policeSite(p.name) === "not-police") return false;
    const name = ` ${normalise(p.name)} `;
    return words.every((w) => name.includes(` ${w} `)) && !(not && name.includes(` ${not} `));
  });
  // More than one (an old and a new building, say): one named for its custody
  // ("Croydon Custody Centre"), else the plainest name.
  const custody = (p: PointOfInterest) => (/custody/i.test(p.name) ? 0 : 1);
  return found.sort((a, b) => custody(a) - custody(b) || a.name.length - b.name.length)[0] ?? null;
}

/** Custody suites in these boroughs: 24/7 first, then contingency. */
export function custodyIn(boroughs: readonly Borough[]): CustodySuite[] {
  const set = new Set(boroughs);
  return CUSTODY_SUITES.filter((c) => set.has(c.borough)).sort((a, b) =>
    a.kind === b.kind ? 0 : a.kind === "24/7" ? -1 : 1,
  );
}
