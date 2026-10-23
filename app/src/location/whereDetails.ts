// What "Where am I" shows and shares (components/WhereAmI.tsx), from a GPS
// fix, the server's answer if any, and the nearest postcode on the phone.
import type { WhereAnswer } from "../api/where";
import { boroughAt } from "../area/area";
import { osGridRef } from "./osGrid";

type Fix = { lat: number; lng: number; accuracy: number | null; timestamp: number };

export interface WhereDetails {
  address: string | null;
  postcode: string | null;
  /** How the postcode was found: the server's address, or the nearest postcode centre on the phone. */
  postcodeNote: string | null;
  borough: string | null;
  grid: string | null;
  latLng: string;
  accuracyM: number | null;
  at: number;
}

export function whereDetails(
  fix: Fix,
  answer: WhereAnswer | null,
  nearestPostcode: { postcode: string; distanceM: number } | null,
): WhereDetails {
  const fromServer = answer?.postcode ?? null;
  return {
    address: answer?.door ? `≈ ${answer.door}` : (answer?.road ?? null),
    postcode: fromServer ?? nearestPostcode?.postcode ?? null,
    postcodeNote: fromServer ? null : nearestPostcode ? `nearest postcode centre, ${nearestPostcode.distanceM} m away` : null,
    borough: boroughAt(fix.lat, fix.lng),
    grid: osGridRef(fix.lat, fix.lng),
    latLng: `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`,
    accuracyM: fix.accuracy == null ? null : Math.round(fix.accuracy),
    at: fix.timestamp,
  };
}

/** The text that's shared: readable in a message, with a map link at the end. */
export function shareText(d: WhereDetails): string {
  const time = new Date(d.at).toLocaleTimeString("en-GB");
  return [
    "My location (Blue Route)",
    [d.address, d.postcode, d.borough].filter(Boolean).join(", "),
    d.grid ? `OS grid ${d.grid}` : null,
    `${d.latLng} (±${d.accuracyM ?? "?"} m at ${time})`,
    `https://maps.google.com/?q=${d.latLng.replace(" ", "")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

