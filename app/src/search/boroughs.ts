// The areas officers pick on Session: London's 32 boroughs and the City,
// then Kent's 12 districts and Medway (the Kent pilot). Index order matches
// the bundled data files (assets/data) and the server's places and roads
// lists (server/places), so don't reorder this list: add new areas at the end.
export const LONDON_BOROUGHS = [
  "Barking and Dagenham",
  "Barnet",
  "Bexley",
  "Brent",
  "Bromley",
  "Camden",
  "City of London",
  "Croydon",
  "Ealing",
  "Enfield",
  "Greenwich",
  "Hackney",
  "Hammersmith and Fulham",
  "Haringey",
  "Harrow",
  "Havering",
  "Hillingdon",
  "Hounslow",
  "Islington",
  "Kensington and Chelsea",
  "Kingston upon Thames",
  "Lambeth",
  "Lewisham",
  "Merton",
  "Newham",
  "Redbridge",
  "Richmond upon Thames",
  "Southwark",
  "Sutton",
  "Tower Hamlets",
  "Waltham Forest",
  "Wandsworth",
  "Westminster",
] as const;

/** Kent County Council's 12 districts, then Medway (a unitary council). */
export const KENT_DISTRICTS = [
  "Ashford",
  "Canterbury",
  "Dartford",
  "Dover",
  "Folkestone and Hythe",
  "Gravesham",
  "Maidstone",
  "Sevenoaks",
  "Swale",
  "Thanet",
  "Tonbridge and Malling",
  "Tunbridge Wells",
  "Medway",
] as const;

export const BOROUGHS = [...LONDON_BOROUGHS, ...KENT_DISTRICTS] as const;

/** A London borough, the City, or a Kent district: one area an officer can pick. */
export type Borough = (typeof BOROUGHS)[number];

export interface AreaRegion {
  id: "london" | "kent";
  name: string;
  /** "borough" or "district", for wording such as "3 boroughs". */
  unit: string;
  areas: readonly Borough[];
}

/** The regions BlueRoute covers, each a list of areas. */
export const AREA_REGIONS: readonly AreaRegion[] = [
  { id: "london", name: "London", unit: "borough", areas: LONDON_BOROUGHS },
  { id: "kent", name: "Kent", unit: "district", areas: KENT_DISTRICTS },
];

/** Every place BlueRoute covers, for wording such as "Outside London and Kent". */
export const COVERED_NAME = AREA_REGIONS.map((r) => r.name).join(" and ");

export function regionOf(area: Borough): AreaRegion {
  return AREA_REGIONS.find((r) => r.areas.includes(area))!;
}
