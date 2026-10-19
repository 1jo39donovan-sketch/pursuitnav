// London's boroughs grouped the way the Met organises them (its 12 Basic
// Command Units, plus the City, which has its own force), so picking an
// operating area is a short list rather than 33 names.
import type { Borough } from "./boroughs";

export interface BoroughGroup {
  name: string;
  boroughs: Borough[];
}

export const BOROUGH_GROUPS: BoroughGroup[] = [
  { name: "Central North", boroughs: ["Camden", "Islington"] },
  { name: "Central East", boroughs: ["Hackney", "Tower Hamlets"] },
  { name: "Central South", boroughs: ["Lambeth", "Southwark"] },
  { name: "Central West", boroughs: ["Westminster", "Kensington and Chelsea", "Hammersmith and Fulham"] },
  { name: "City of London", boroughs: ["City of London"] },
  { name: "North", boroughs: ["Enfield", "Haringey"] },
  { name: "North East", boroughs: ["Newham", "Waltham Forest"] },
  { name: "North West", boroughs: ["Barnet", "Brent", "Harrow"] },
  { name: "East", boroughs: ["Barking and Dagenham", "Havering", "Redbridge"] },
  { name: "South East", boroughs: ["Bexley", "Greenwich", "Lewisham"] },
  { name: "South", boroughs: ["Bromley", "Croydon", "Sutton"] },
  { name: "South West", boroughs: ["Kingston upon Thames", "Merton", "Richmond upon Thames", "Wandsworth"] },
  { name: "West", boroughs: ["Ealing", "Hillingdon", "Hounslow"] },
];
