// The first-launch setup: one question per screen, in this order. Every
// answer is kept and can be changed later on Session.
import type { RegionId } from "../search/boroughs";

export type SetupStep = "service" | "region" | "areas" | "vehicle" | "callsign" | "blueLight";

export const SETUP_STEPS: readonly SetupStep[] = ["service", "region", "areas", "vehicle", "callsign", "blueLight"];

/** Setting kept once setup is finished or skipped, so it shows only once. */
export const SETUP_DONE_KEY = "setupDone";

/**
 * Whether to show setup: never once finished, and not for anyone who set
 * things up on Session before it existed (a service or an area chosen).
 */
export function needsSetup(saved: { done: string | null; service: string | null; areas: number }): boolean {
  return saved.done == null && saved.service == null && saved.areas === 0;
}

export function nextStep(step: SetupStep): SetupStep | null {
  const i = SETUP_STEPS.indexOf(step);
  return SETUP_STEPS[i + 1] ?? null;
}

export function previousStep(step: SetupStep): SetupStep | null {
  const i = SETUP_STEPS.indexOf(step);
  return i > 0 ? SETUP_STEPS[i - 1]! : null;
}

/** "Step 2 of 6". */
export function stepLabel(step: SetupStep): string {
  return `Step ${SETUP_STEPS.indexOf(step) + 1} of ${SETUP_STEPS.length}`;
}

/** The region whose areas are shown on the areas screen. */
export type ChosenRegion = RegionId;
