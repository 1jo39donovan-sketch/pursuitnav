// Browsers have no foreground service: the web app keeps the screen on instead.
import type { Fix } from "./LocationProvider";

export function onDrivingFix(_fn: (fix: Fix) => void): () => void {
  return () => {};
}

export function useDrivingService(_who: string, _on: boolean) {}
