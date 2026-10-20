// London's boroughs grouped by the Met's 12 Basic Command Units (BCUs), in
// the Met's own order and codes, plus the City, which has its own force, so
// picking an operating area is a short list rather than 33 names.
import type { Borough } from "./boroughs";

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
