// Flagged routes: one tap in navigation flags a route, and after END the
// crew can send the flags as an email they write in their own mail app, filled in with what helps put a route right and nothing
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

/** One email for every route flagged, so a shift's flags go together: the question once, then each route. */
export function flagsBody(rs: readonly RouteReport[], version: string, platform: string): string {
  const bodies = rs.map((r) => reportBody(r, version, platform));
  if (bodies.length === 1) return bodies[0]!;
  const ABOUT = "— About the route (no addresses or places) —";
  const question = bodies[0]!.slice(0, bodies[0]!.indexOf(ABOUT));
  const routes = bodies.map((b, i) =>
    b.slice(b.indexOf(ABOUT)).replace(ABOUT, `— Route ${i + 1} of ${rs.length} (no addresses or places) —`),
  );
  return question + routes.join("\n\n");
}

export function flagsUrl(rs: readonly RouteReport[]): string {
  const version = Constants.expoConfig?.version ?? "unknown";
  const subject = rs.length === 1 ? "BlueRoute: problem with a route" : `BlueRoute: problems with ${rs.length} routes`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    flagsBody(rs, version, Platform.OS),
  )}`;
}
