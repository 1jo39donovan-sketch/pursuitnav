// London's 32 boroughs and the City. Index order matches the bundled data
// files (assets/data), so don't reorder this list.
export const BOROUGHS = [
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

export type Borough = (typeof BOROUGHS)[number];

/** Chip order on the Session tab: the City first, then A–Z. */
export const CHIP_ORDER: Borough[] = ["City of London", ...BOROUGHS.filter((b) => b !== "City of London")];
