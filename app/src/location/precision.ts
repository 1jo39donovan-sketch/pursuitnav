// Full-precision GPS (BestForNavigation) costs battery, so it's asked for
// only while navigating or in Pursuit; elsewhere a lighter fix does (PM,
// item 13). Screens say they need it; the location provider listens.
import { useEffect, useSyncExternalStore } from "react";

const holders = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function holdPrecise(who: string, on: boolean) {
  const had = holders.size > 0;
  if (on) holders.add(who);
  else holders.delete(who);
  if (had !== holders.size > 0) emit();
}

export const preciseWanted = () => holders.size > 0;

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Whether any screen needs full-precision GPS now. */
export function usePreciseWanted(): boolean {
  return useSyncExternalStore(subscribe, preciseWanted, preciseWanted);
}

/** This screen needs full-precision GPS while `on`. */
export function usePrecise(who: string, on: boolean) {
  useEffect(() => {
    if (!on) return;
    holdPrecise(who, true);
    return () => holdPrecise(who, false);
  }, [who, on]);
}
