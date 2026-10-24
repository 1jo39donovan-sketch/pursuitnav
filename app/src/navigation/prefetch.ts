// Routes worked out before the tap: when the search has settled on a likely
// match, its routes are asked for straight away, so they're often ready by
// the time the operator taps it. Used only if that match is picked, from
// about where the phone still is, soon after; otherwise dropped.
import type { RoutePlan } from "../api/routes";
import type { SearchResults, SearchResult } from "../search/engine";
import { planIsStale, type PlanOrigin } from "./routeChoice";

/** More matches than this in the area and the top one is no safe guess. */
export const PREFETCH_MAX_MATCHES = 3;
/** Typing has to pause this long first, so a half-typed name doesn't ask. */
export const PREFETCH_PAUSE_MS = 600;

export interface Prefetch {
  key: string;
  origin: PlanOrigin;
  quick: Promise<RoutePlan>;
  full: Promise<RoutePlan> | null;
  controller: AbortController;
  /** Set when either request fails: a fresh try is made on the tap. */
  failed: boolean;
}

/** The match worth routing to before the tap: the top one in the area, when there are few. */
export function prefetchTarget(results: SearchResults): SearchResult | null {
  const n = results.inArea.length;
  return n >= 1 && n <= PREFETCH_MAX_MATCHES ? results.inArea[0]! : null;
}

/** What a plan depends on: where to, and the choices that change the route. */
export function prefetchKey(
  to: { lat: number; lng: number },
  vehicle: string,
  roads: string,
  blueLight: boolean,
): string {
  return `${to.lat.toFixed(6)},${to.lng.toFixed(6)}|${vehicle}|${roads}|${blueLight ? "bl" : "std"}`;
}

/** A prefetch fit to use for this plan now: same key, not failed, not stale. */
export function usable(
  p: Prefetch | null,
  key: string,
  fix: { lat: number; lng: number } | null | undefined,
  now: number,
): boolean {
  return !!p && p.key === key && !p.failed && !planIsStale(p.origin, fix, now);
}
