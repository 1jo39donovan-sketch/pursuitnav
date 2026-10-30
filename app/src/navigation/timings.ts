// How long the last route took, stage by stage, shown on Session → Testing
// so a tester can read real numbers off the phone (the 30 Oct browser test
// timed GO to the turn card at 3.2 s and a pin's route at 15 s by eye). Kept
// in memory only: no addresses or positions, just milliseconds.
import { useSyncExternalStore } from "react";

export interface RouteTimings {
  /** Asking for the building's way in, before routing. */
  entranceMs?: number;
  /** The standard route: the server's own time, and the whole round trip. */
  standardServerMs?: number;
  standardMs?: number;
  /** The full plan (with the blue-light check). */
  fullServerMs?: number;
  fullMs?: number;
  /** From the tap to the route cards showing. */
  cardsMs?: number;
  /** From GO to the turn card on screen. */
  goToCardMs?: number;
}

let current: RouteTimings = {};
let routeStartedAt = 0;
let goAt = 0;
const listeners = new Set<() => void>();

function set(patch: RouteTimings) {
  current = { ...current, ...patch };
  for (const l of listeners) l();
}

/** A destination was picked: a fresh set of timings. */
export function routeStarted(now = Date.now()) {
  routeStartedAt = now;
  current = {};
  for (const l of listeners) l();
}

export function noteEntrance(ms: number) {
  set({ entranceMs: ms });
}

export function noteRequest(standardOnly: boolean, totalMs: number, serverMs: number | undefined) {
  set(standardOnly ? { standardMs: totalMs, standardServerMs: serverMs } : { fullMs: totalMs, fullServerMs: serverMs });
}

export function noteCards(now = Date.now()) {
  if (routeStartedAt && current.cardsMs == null) set({ cardsMs: now - routeStartedAt });
}

export function noteGo(now = Date.now()) {
  goAt = now;
}

export function noteTurnCard(now = Date.now()) {
  if (goAt) set({ goToCardMs: now - goAt });
  goAt = 0;
}

/** "server-timing: plan;dur=812" → 812. */
export function serverDuration(header: string | null): number | undefined {
  const m = header?.match(/dur=([\d.]+)/);
  return m ? Math.round(Number(m[1])) : undefined;
}

/** The timings as one line: "Cards 1.4 s (way in 0.3 s, standard 0.9 s of which server 0.6 s) · GO to turn card 0.2 s". */
export function timingsText(t: RouteTimings): string | null {
  const s = (ms?: number) => (ms == null ? null : `${(ms / 1000).toFixed(1)} s`);
  const parts = [
    t.cardsMs != null ? `Route cards ${s(t.cardsMs)}` : null,
    t.entranceMs != null ? `way in ${s(t.entranceMs)}` : null,
    t.standardMs != null ? `standard ${s(t.standardMs)}${t.standardServerMs != null ? ` (server ${s(t.standardServerMs)})` : ""}` : null,
    t.fullMs != null ? `blue-light check ${s(t.fullMs)}${t.fullServerMs != null ? ` (server ${s(t.fullServerMs)})` : ""}` : null,
    t.goToCardMs != null ? `GO to turn card ${s(t.goToCardMs)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function useRouteTimings(): RouteTimings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
