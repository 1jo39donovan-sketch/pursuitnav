// Whether the car has stopped: door numbers then show on the navigation map
// (they crowd the road while moving), so the crew can find the door. Stopped
// after STOPPED_FOR_MS under STOPPED_BELOW_MS; moving again over MOVING_OVER_MS,
// so creeping in traffic doesn't flick them on and off. Pure, for tests.
import { useState } from "react";

export const STOPPED_BELOW_MS = 1;
export const MOVING_OVER_MS = 2.5;
export const STOPPED_FOR_MS = 4000;

export interface StopState {
  stopped: boolean;
  slowSince: number | null;
}

export function nextStop(state: StopState, speed: number | null | undefined, now: number): StopState {
  if (speed == null) return state;
  if (speed > MOVING_OVER_MS) return { stopped: false, slowSince: null };
  if (speed >= STOPPED_BELOW_MS) return { stopped: state.stopped, slowSince: null };
  const slowSince = state.slowSince ?? now;
  return { stopped: state.stopped || now - slowSince >= STOPPED_FOR_MS, slowSince };
}

/** Stopped now, from each fix's speed and time (state worked out as each new fix renders). */
export function useStopped(fix: { speed?: number | null; timestamp: number } | null): boolean {
  const [state, setState] = useState<StopState & { at: number | null }>({ stopped: false, slowSince: null, at: null });
  if (fix && fix.timestamp !== state.at) {
    setState({ ...nextStop(state, fix.speed, fix.timestamp), at: fix.timestamp });
  }
  return state.stopped;
}
