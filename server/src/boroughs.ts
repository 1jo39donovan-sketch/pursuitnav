// OS AddressBase local custodian codes for the London boroughs.
// TODO(before v1): confirm these against the OS Data Hub's current list.
export const LONDON_CUSTODIANS: Record<number, string> = {
  5030: "City of London",
  5060: "Barking and Dagenham",
  5090: "Barnet",
  5120: "Bexley",
  5150: "Brent",
  5180: "Bromley",
  5210: "Camden",
  5240: "Croydon",
  5270: "Ealing",
  5300: "Enfield",
  5330: "Greenwich",
  5360: "Hackney",
  5390: "Hammersmith and Fulham",
  5420: "Haringey",
  5450: "Harrow",
  5480: "Havering",
  5510: "Hillingdon",
  5540: "Hounslow",
  5570: "Islington",
  5600: "Kensington and Chelsea",
  5630: "Kingston upon Thames",
  5660: "Lambeth",
  5690: "Lewisham",
  5720: "Merton",
  5750: "Newham",
  5780: "Redbridge",
  5810: "Richmond upon Thames",
  5840: "Southwark",
  5870: "Sutton",
  5900: "Tower Hamlets",
  5930: "Waltham Forest",
  5960: "Wandsworth",
  5990: "Westminster",
};

// The Kent pilot: Kent's 12 districts and Medway. Same TODO as above.
export const KENT_CUSTODIANS: Record<number, string> = {
  2205: "Ashford",
  2210: "Canterbury",
  2215: "Dartford",
  2220: "Dover",
  2230: "Gravesham",
  2235: "Maidstone",
  2245: "Sevenoaks",
  2250: "Folkestone and Hythe",
  2255: "Swale",
  2260: "Thanet",
  2265: "Tonbridge and Malling",
  2270: "Tunbridge Wells",
  2280: "Medway",
};

/** Every area BlueRoute covers, by local custodian code. */
export const AREA_CUSTODIANS: Record<number, string> = { ...LONDON_CUSTODIANS, ...KENT_CUSTODIANS };

/** The area names (London boroughs, Kent districts), exactly as the app has them (app/src/search/boroughs.ts). */
export const BOROUGH_NAMES: ReadonlySet<string> = new Set(Object.values(AREA_CUSTODIANS));
