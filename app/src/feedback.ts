// "Report a problem with this route": an email the tester writes in their
// own mail app, filled in with what helps put a route right and nothing
// from the call: no addresses, positions, road names or times of day. The
// tester says what went wrong, and is asked to keep the call out of it.
import Constants from "expo-constants";
import { Platform } from "react-native";

import { SUPPORT_EMAIL } from "./config";

export interface RouteReport {
  kind: "standard" | "police" | "follow";
  vehicle: string;
  roads: string;
  mapLook: string;
  distanceM: number;
  durationS: number;
  /** Restricted manoeuvres a blue-light route uses: how many, never where. */
  restrictions?: number;
}

const KIND = { standard: "Standard", police: "Blue light", follow: "Follow-in" } as const;

export function reportBody(r: RouteReport, version: string, platform: string): string {
  return [
    "What went wrong? (Please don't include addresses, names or anything about the call.)",
    "",
    "",
    "",
    "— About the route (no addresses or places) —",
    `Route: ${KIND[r.kind]}`,
    `Vehicle: ${r.vehicle}`,
    `Roads: ${r.roads === "main" ? "prefer main roads" : "any roads"}`,
    `Length: ${(r.distanceM / 1609.344).toFixed(1)} miles, ${Math.round(r.durationS / 60)} min`,
    ...(r.restrictions != null ? [`Restrictions used: ${r.restrictions}`] : []),
    `Map style: ${r.mapLook}`,
    `App: ${version} (${platform})`,
  ].join("\n");
}

export function reportUrl(r: RouteReport): string {
  const version = Constants.expoConfig?.version ?? "unknown";
  const subject = "BlueRoute: problem with a route";
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    reportBody(r, version, Platform.OS),
  )}`;
}
