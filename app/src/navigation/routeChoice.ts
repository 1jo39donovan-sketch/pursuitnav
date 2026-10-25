// Choosing a route under stress: the cards stay where they are, a tap can't
// land on a card that has just changed, and a plan from an old position is
// refreshed before it's followed. Pure, so it can be tested.
import type { NoPoliceReason, PoliceRoute, Route, RoutePlan } from "../api/routes";
import { distanceM } from "../geo";

export type PoliceSlot =
  | { kind: "police"; state: "route"; route: PoliceRoute; fastest: boolean }
  | { kind: "police"; state: "checking" }
  | { kind: "police"; state: "none"; reason: NoPoliceReason };
export type StandardSlot = { kind: "standard"; route: Route; fastest: boolean };

/**
 * The two cards, left to right: blue light always on the left, standard
 * always on the right, whatever has arrived. "Fastest" is a badge in a card;
 * it never moves one.
 */
export function cardSlots(plan: RoutePlan, checking: boolean): [PoliceSlot, StandardSlot] {
  const police: PoliceSlot = plan.police
    ? { kind: "police", state: "route", route: plan.police, fastest: true }
    : checking
      ? { kind: "police", state: "checking" }
      : { kind: "police", state: "none", reason: plan.noPoliceReason ?? "not-faster" };
  // Fastest only once it's known: not while the blue-light route is being checked.
  return [police, { kind: "standard", route: plan.standard, fastest: !plan.police && !checking }];
}

/** What a card shows, as a string: when it changes, the card has changed. */
export function slotKey(slot: PoliceSlot | StandardSlot): string {
  if (slot.kind === "standard") return `standard:${slot.route.durationS}:${slot.route.distanceM}:${slot.fastest}`;
  if (slot.state === "route") return `police:${slot.route.durationS}:${slot.route.distanceM}`;
  return slot.state === "checking" ? "police:checking" : `police:none:${slot.reason}`;
}

/** Go taps this soon after a card changes are ignored. */
export const TAP_GUARD_MS = 400;

/**
 * Ignores taps for TAP_GUARD_MS after the content changes, so a tap aimed at
 * one route can't land on another that has just taken its place.
 */
export function createTapGuard(windowMs = TAP_GUARD_MS) {
  let key: string | undefined;
  let changedAt = -Infinity;
  return {
    /** Note what's showing now. */
    see(next: string, now: number) {
      if (next === key) return;
      key = next;
      changedAt = now;
    },
    allows(now: number): boolean {
      return now - changedAt >= windowMs;
    },
  };
}

/** Where and when a plan was made. */
export interface PlanOrigin {
  madeAt: number;
  from: { lat: number; lng: number };
}

/** Older than this, a plan is refreshed before it's followed. */
export const STALE_AFTER_MS = 20_000;
/** Moved further than this from where it was made, likewise. */
export const STALE_BEYOND_M = 150;

/** True if the plan should be made again from where the phone is now. */
export function planIsStale(
  plan: PlanOrigin,
  fix: { lat: number; lng: number } | null | undefined,
  now: number,
): boolean {
  if (now - plan.madeAt > STALE_AFTER_MS) return true;
  return !!fix && distanceM(fix, plan.from) > STALE_BEYOND_M;
}

/**
 * Go quietly plans again from here once a plan is 20 s old; the card only
 * mentions the plan's age once it's a couple of minutes old, calmly.
 */
export const AGE_SHOWN_AFTER_MS = 120_000;

/** "Planned 3 min ago" once a plan is old enough to say so, else null. */
export function planAgeText(madeAt: number, now: number): string | null {
  const ageMs = now - madeAt;
  if (ageMs < AGE_SHOWN_AFTER_MS) return null;
  return `Planned ${Math.floor(ageMs / 60_000)} min ago`;
}

const KIND_WORDS: Record<string, [string, string]> = {
  turn: ["banned turn", "banned turns"],
  "bus-only": ["bus-only section", "bus-only sections"],
  manoeuvre: ["restricted manoeuvre", "restricted manoeuvres"],
  "wrong-way": ["one-way section", "one-way sections"],
};

/**
 * What a blue-light route relies on, in words a crew can weigh at a glance:
 * "1 banned turn", "2 bus-only sections and 1 banned turn". "at least" when
 * the server couldn't check every stretch.
 */
export function restrictionSummary(kinds: readonly string[], complete: boolean): string {
  if (!kinds.length) return "no restrictions";
  const counts = new Map<string, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  const parts = [...counts].map(([k, n]) => {
    const [one, many] = KIND_WORDS[k] ?? ["restriction", "restrictions"];
    return `${n} ${n === 1 ? one : many}`;
  });
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]!;
  return complete ? list : `at least ${list}`;
}
