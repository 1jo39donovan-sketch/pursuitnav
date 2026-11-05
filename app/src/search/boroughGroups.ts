// London's boroughs grouped by the Met's 12 Basic Command Units (BCUs), in
// the Met's own order and codes, plus the City, which has its own force, so
// picking an operating area is a short list rather than 33 names.
import { AREA_REGIONS, type Borough } from "./boroughs";

export interface BoroughGroup {
  /** The Met's BCU code (AS, CN…), or "" for the City. */
  code: string;
  name: string;
  boroughs: Borough[];
}

export const BOROUGH_GROUPS: BoroughGroup[] = [
  { code: "AS", name: "Central South", boroughs: ["Lambeth", "Southwark"] },
  { code: "AW", name: "Central West", boroughs: ["Westminster", "Kensington and Chelsea", "Hammersmith and Fulham"] },
  { code: "CE", name: "Central East", boroughs: ["Hackney", "Tower Hamlets"] },
  { code: "CN", name: "Central North", boroughs: ["Camden", "Islington"] },
  { code: "EA", name: "East Area", boroughs: ["Barking and Dagenham", "Havering", "Redbridge"] },
  { code: "NA", name: "North Area", boroughs: ["Enfield", "Haringey"] },
  { code: "NE", name: "North East", boroughs: ["Newham", "Waltham Forest"] },
  { code: "NW", name: "North West", boroughs: ["Barnet", "Brent", "Harrow"] },
  { code: "SE", name: "South East", boroughs: ["Bexley", "Greenwich", "Lewisham"] },
  { code: "SN", name: "South Area", boroughs: ["Bromley", "Croydon", "Sutton"] },
  { code: "SW", name: "South West", boroughs: ["Kingston upon Thames", "Merton", "Richmond upon Thames", "Wandsworth"] },
  { code: "WA", name: "West Area", boroughs: ["Ealing", "Hillingdon", "Hounslow"] },
  { code: "", name: "City of London Police", boroughs: ["City of London"] },
];

/** The Met's 12 BCUs (without the City, which has its own force). */
export const BCUS: BoroughGroup[] = BOROUGH_GROUPS.filter((g) => g.code !== "");

/** The BCU most of the chosen boroughs are in, or null if none is in one (none chosen, or only the City). */
export function bcuFor(boroughs: readonly Borough[]): BoroughGroup | null {
  const score = (g: BoroughGroup) => g.boroughs.filter((b) => boroughs.includes(b)).length;
  const best = [...BCUS].sort((a, b) => score(b) - score(a))[0]!;
  return score(best) > 0 ? best : null;
}

/**
 * Big areas for units that work across London (TSG, firearms, traffic…):
 * one tap picks every borough in them. Neighbouring areas overlap.
 */
export const LONDON_AREAS: { name: string; boroughs: Borough[] }[] = [
  {
    name: "Central",
    boroughs: ["City of London", "Westminster", "Camden", "Islington", "Hackney", "Tower Hamlets", "Southwark", "Lambeth", "Kensington and Chelsea"],
  },
  {
    name: "North",
    boroughs: ["Barnet", "Enfield", "Haringey", "Camden", "Islington", "Hackney", "Waltham Forest", "Brent", "Harrow"],
  },
  {
    name: "East",
    boroughs: ["Tower Hamlets", "Newham", "Barking and Dagenham", "Havering", "Redbridge", "Waltham Forest", "Hackney", "Greenwich", "Bexley"],
  },
  {
    name: "South",
    boroughs: ["Lambeth", "Southwark", "Lewisham", "Greenwich", "Bexley", "Bromley", "Croydon", "Sutton", "Merton", "Wandsworth", "Kingston upon Thames"],
  },
  {
    name: "West",
    boroughs: ["Hillingdon", "Ealing", "Hounslow", "Hammersmith and Fulham", "Kensington and Chelsea", "Richmond upon Thames", "Brent", "Harrow", "Westminster"],
  },
];

/**
 * Kent in three parts, the way Kent Police's divisions split it. One tap
 * picks every district in one.
 */
export const KENT_GROUPS: BoroughGroup[] = [
  { code: "", name: "North Kent", boroughs: ["Dartford", "Gravesham", "Medway", "Swale"] },
  { code: "", name: "East Kent", boroughs: ["Ashford", "Canterbury", "Dover", "Folkestone and Hythe", "Thanet"] },
  { code: "", name: "West Kent", boroughs: ["Maidstone", "Sevenoaks", "Tonbridge and Malling", "Tunbridge Wells"] },
];

/** The one-tap big areas, per region (London's are "North" and so on; Kent's say "Kent"). */
export const BIG_AREAS: Record<"london" | "kent", { name: string; boroughs: Borough[] }[]> = {
  london: LONDON_AREAS.map((a) => ({ name: `${a.name} London`, boroughs: a.boroughs })),
  kent: KENT_GROUPS.map((g) => ({ name: g.name, boroughs: g.boroughs })),
};

/**
 * What's picked, in words: "All London", "East Kent (5 districts)",
 * "All London and Kent", or the areas by name. Short for the header.
 */
export function areaSummary(chosen: readonly Borough[], short = false): string {
  if (!chosen.length) return short ? "No area" : "None chosen: every search result shows as outside your area.";
  const has = (list: readonly Borough[]) => list.every((b) => chosen.includes(b));
  const whole = AREA_REGIONS.filter((r) => has(r.areas));
  const covered = whole.reduce((n, r) => n + r.areas.length, 0);
  if (whole.length && covered === chosen.length) return `All ${whole.map((r) => r.name).join(" and ")}`;
  for (const r of AREA_REGIONS) {
    const big = BIG_AREAS[r.id].find((a) => a.boroughs.length === chosen.length && has(a.boroughs));
    if (big) return short ? big.name : `${big.name} (${chosen.length} ${r.unit}s)`;
  }
  if (short) return chosen.length <= 2 ? chosen.join(" · ") : `${chosen[0]} +${chosen.length - 1}`;
  return chosen.join(" · ");
}
