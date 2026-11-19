// Routes flagged during navigation, kept on the phone until the crew sends
// or discards them after END. Nothing about the call is kept (feedback.ts).
import type { RouteReport } from "./feedback";
import { store } from "./storage/store";

const KEY = "flaggedRoutes";

export function flaggedRoutes(): RouteReport[] {
  try {
    const parsed = JSON.parse(store.getSetting(KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as RouteReport[]) : [];
  } catch {
    return [];
  }
}

export function flagRoute(r: RouteReport) {
  store.setSetting(KEY, JSON.stringify([...flaggedRoutes(), r]));
}

export function clearFlags() {
  store.setSetting(KEY, "[]");
}
