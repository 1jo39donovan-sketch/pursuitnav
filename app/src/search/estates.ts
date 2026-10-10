import type { Borough } from "./boroughs";
import type { Place, SearchIndex } from "./engine";

/**
 * Starter list of estates, each anchored to the main road it sits on.
 * Officers add their own blocks and estates on the Search tab.
 */
export const STARTER_ESTATES: { name: string; road: string; borough: Borough }[] = [
  { name: "Bemerton Estate", road: "Caledonian Road", borough: "Islington" },
  { name: "Andover Estate", road: "Hornsey Road", borough: "Islington" },
  { name: "Six Acres Estate", road: "Hornsey Road", borough: "Islington" },
  { name: "Packington Estate", road: "Packington Street", borough: "Islington" },
  { name: "Marquess Estate", road: "Marquess Road", borough: "Islington" },
  { name: "Spa Green Estate", road: "Rosebery Avenue", borough: "Islington" },
  { name: "Finsbury Estate", road: "Skinner Street", borough: "Islington" },
  { name: "Elthorne Estate", road: "Hazellville Road", borough: "Islington" },
  { name: "Highbury Quadrant Estate", road: "Highbury Quadrant", borough: "Islington" },
  { name: "Golden Lane Estate", road: "Golden Lane", borough: "City of London" },
  { name: "Barbican Estate", road: "Silk Street", borough: "City of London" },
  { name: "Middlesex Street Estate", road: "Middlesex Street", borough: "City of London" },
  { name: "Pembury Estate", road: "Pembury Road", borough: "Hackney" },
  { name: "Kingsmead Estate", road: "Kingsmead Way", borough: "Hackney" },
  { name: "Aylesbury Estate", road: "Thurlow Street", borough: "Southwark" },
  { name: "Churchill Gardens Estate", road: "Grosvenor Road", borough: "Westminster" },
  { name: "Lisson Green Estate", road: "Lisson Grove", borough: "Westminster" },
  { name: "Ocean Estate", road: "Ben Jonson Road", borough: "Tower Hamlets" },
  { name: "Loughborough Estate", road: "Loughborough Road", borough: "Lambeth" },
];

/** The starter estates as places, located at their road's point. */
export function starterEstatePlaces(index: SearchIndex): Place[] {
  return STARTER_ESTATES.flatMap(({ name, road, borough }) => {
    const r = index.findRoad(road, borough);
    return r ? [{ name, road, borough, lat: r.lat, lng: r.lng, kind: "estate" as const }] : [];
  });
}
