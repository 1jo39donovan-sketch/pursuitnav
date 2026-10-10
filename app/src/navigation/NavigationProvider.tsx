import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { PoliceRoute, Route, RoutePlan } from "../api/routes";

export type RouteKind = "standard" | "police";

export interface ActiveNavigation {
  /** What the operator chose. Re-routes keep to it where they can. */
  kind: RouteKind;
  route: Route | PoliceRoute;
  destination: { lat: number; lng: number; title: string };
  /** Shown under the turn panel, e.g. why a re-route fell back to standard. */
  note?: string;
}

interface NavigationContextValue {
  active: ActiveNavigation | null;
  start: (kind: RouteKind, plan: RoutePlan, destination: ActiveNavigation["destination"]) => void;
  /** Swap in a new plan after re-routing, keeping the operator's choice where possible. */
  replan: (plan: RoutePlan) => void;
  stop: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

/** Picks the route of the chosen kind from a plan, falling back to standard if needed. */
export function chooseRoute(kind: RouteKind, plan: RoutePlan): { route: Route | PoliceRoute; note?: string } {
  if (kind === "police") {
    if (plan.police) return { route: plan.police };
    return { route: plan.standard, note: "No faster police route from here. Following the standard route." };
  }
  return { route: plan.standard };
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveNavigation | null>(null);

  const start = useCallback((kind: RouteKind, plan: RoutePlan, destination: ActiveNavigation["destination"]) => {
    setActive({ kind, destination, ...chooseRoute(kind, plan) });
  }, []);

  const replan = useCallback((plan: RoutePlan) => {
    setActive((cur) => {
      if (!cur) return cur;
      const chosen = chooseRoute(cur.kind, plan);
      // A new police route may rely on different restrictions: say so, never silently.
      const police = "restrictions" in chosen.route ? chosen.route : null;
      const note =
        chosen.note ??
        (police
          ? `Re-routed. Police route relies on ${police.restrictionsComplete ? "" : "at least "}${police.restrictions.length} restriction${police.restrictions.length === 1 ? "" : "s"}.`
          : "Re-routed.");
      return { ...cur, route: chosen.route, note };
    });
  }, []);

  const stop = useCallback(() => setActive(null), []);

  const value = useMemo(() => ({ active, start, replan, stop }), [active, start, replan, stop]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used inside NavigationProvider");
  return ctx;
}
