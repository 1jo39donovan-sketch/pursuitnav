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


/** Ask the server again once moved this far, or after this long, while the panel is open. */
export const LOOKUP_AGAIN_M = 15;
export const LOOKUP_AGAIN_MS = 20_000;

/** Whether the address should be looked up again for this fix. */
export function shouldLookUp(
  last: { lat: number; lng: number; at: number } | null,
  fix: { lat: number; lng: number },
  now: number,
): boolean {
  if (!last) return true;
  return now - last.at >= LOOKUP_AGAIN_MS || metresApart(last, fix) >= LOOKUP_AGAIN_M;
}

function metresApart(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6371000;
}
