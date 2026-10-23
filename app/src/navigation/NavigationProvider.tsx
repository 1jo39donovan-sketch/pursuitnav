import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { PoliceRoute, Route, RoutePlan } from "../api/routes";
import type { ReplanStage } from "./reroute";

/** follow: the way a colleague drove in (team sessions). */
export type RouteKind = "standard" | "police" | "follow";

export interface ActiveNavigation {
  /** What the operator chose. Re-routes keep to it where they can. */
  kind: RouteKind;
  route: Route | PoliceRoute;
  destination: { lat: number; lng: number; title: string };
  /** Shown under the turn panel, e.g. why a re-route fell back to standard. */
  note?: string;
  /** For follow-in: whose way in, and their track, to re-route along it. */
  follow?: { callsign: string; track: { lat: number; lng: number }[] };
  /** Goes up by one each time a re-route from here is asked for (stale plan, "Re-route now"). */
  rerouteAsked: number;
  /** Why the last re-route was asked for, for field-test recording. */
  rerouteReason?: "reroute-now" | "switch" | "stale-refresh";
}

/** Why navigation ended: Search clears or refreshes its plan to match. */
export type EndReason = "end" | "arrived" | "new-destination";

interface NavigationContextValue {
  active: ActiveNavigation | null;
  /** The last time navigation ended, and why. */
  ended: { at: number; reason: EndReason } | null;
  start: (
    kind: RouteKind,
    plan: RoutePlan,
    destination: ActiveNavigation["destination"],
    follow?: ActiveNavigation["follow"],
    /** The plan is old or from somewhere else: re-route from here straight away. */
    refresh?: boolean,
  ) => void;
  /**
   * Swap in a new plan after re-routing, keeping the operator's choice where
   * possible. stage "checking": only the standard route is in so far.
   */
  replan: (plan: RoutePlan, stage?: ReplanStage) => void;
  /** Re-route from here now, switching to another kind of route if given. */
  rerouteNow: (kind?: "standard" | "police") => void;
  stop: (reason?: EndReason) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

/** Picks the route of the chosen kind from a plan, falling back to standard if needed. */
export function chooseRoute(
  kind: RouteKind,
  plan: RoutePlan,
  stage: ReplanStage = "done",
): { route: Route | PoliceRoute; note?: string } {
  if (kind === "follow") return { route: plan.police ?? plan.standard };
  if (kind === "police") {
    if (plan.police) return { route: plan.police };
    // Never "no faster route" before the full plan has answered.
    if (stage === "checking") return { route: plan.standard, note: "Checking for a blue-light route…" };
    if (plan.noPoliceReason === "check-failed") {
      return { route: plan.standard, note: "Couldn’t check for a blue-light route. Following the standard route." };
    }
    return {
      route: plan.standard,
      note: "No faster police route from here. Following the standard route.",
    };
  }
  return { route: plan.standard };
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveNavigation | null>(null);
  const [ended, setEnded] = useState<{ at: number; reason: EndReason } | null>(null);

  const start = useCallback(
    (
      kind: RouteKind,
      plan: RoutePlan,
      destination: ActiveNavigation["destination"],
      follow?: ActiveNavigation["follow"],
      refresh = false,
    ) => {
      const chosen = chooseRoute(kind, plan);
      // Their way in may use restrictions: say how many up front, never silently.
      const n = "restrictions" in chosen.route ? chosen.route.restrictions.length : 0;
      const note = follow
        ? `Following ${follow.callsign}’s way in. ${n ? `Uses ${n} restriction${n === 1 ? "" : "s"} (R on the map).` : "No restrictions found on it."}`
        : chosen.note;
      setActive({
        kind,
        destination,
        follow,
        ...chosen,
        note,
        rerouteAsked: refresh ? 1 : 0,
        ...(refresh ? { rerouteReason: "stale-refresh" as const } : {}),
      });
    },
    [],
  );

  const replan = useCallback((plan: RoutePlan, stage: ReplanStage = "done") => {
    setActive((cur) => {
      if (!cur) return cur;
      const chosen = chooseRoute(cur.kind, plan, stage);
      // Only a change the crew must know about is said (a fall back to the
      // standard route); the badge shows how many restrictions the route uses.
      const note = chosen.note;
      return { ...cur, route: chosen.route, note };
    });
  }, []);

  const rerouteNow = useCallback((kind?: "standard" | "police") => {
    setActive(
      (cur) =>
        cur && {
          ...cur,
          kind: cur.kind === "follow" ? cur.kind : (kind ?? cur.kind),
          rerouteAsked: cur.rerouteAsked + 1,
          rerouteReason: kind && kind !== cur.kind ? "switch" : "reroute-now",
        },
    );
  }, []);

  const stop = useCallback((reason: EndReason = "end") => {
    setActive(null);
    setEnded({ at: Date.now(), reason });
  }, []);

  const value = useMemo(
    () => ({ active, ended, start, replan, rerouteNow, stop }),
    [active, ended, start, replan, rerouteNow, stop],
  );
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used inside NavigationProvider");
  return ctx;
}
