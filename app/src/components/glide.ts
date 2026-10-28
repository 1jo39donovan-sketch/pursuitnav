// The vehicle glides from one GPS fix to the next, rather than jumping a few
// metres once a second: the arrow (and the map following it) move as smoothly
// as the car does. Pure maths here; the maps run the animation.
import { useEffect, useRef, useState } from "react";

export interface Pose {
  lng: number;
  lat: number;
  /** Degrees from north; null when the direction isn't known. */
  course: number | null;
}

/** Beyond this, a new position is drawn at once (a re-route, or the first fix after a gap). */
export const JUMP_M = 150;
/** How long a glide takes: about the time between fixes, within these bounds. */
export const GLIDE_MIN_MS = 300;
export const GLIDE_MAX_MS = 1500;

/** Degrees a to b by the shorter way round, t of the way. */
export function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

export function lerpPose(from: Pose, to: Pose, t: number): Pose {
  return {
    lng: from.lng + (to.lng - from.lng) * t,
    lat: from.lat + (to.lat - from.lat) * t,
    course: from.course == null || to.course == null ? to.course : lerpAngle(from.course, to.course, t),
  };
}

export function metresBetween(a: Pose, b: Pose): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** How long to glide to a new fix, given when the last one came. */
export function glideMs(sinceLastMs: number): number {
  return Math.max(GLIDE_MIN_MS, Math.min(GLIDE_MAX_MS, sinceLastMs));
}

/**
 * Runs a glide towards each new target, calling `draw` every frame with the
 * pose to show. Returns a function to call with each new target, and one to stop.
 */
export function glider(draw: (pose: Pose, done: boolean) => void, now: () => number = () => performance.now()) {
  let shown: Pose | null = null;
  let frame: number | null = null;
  let lastTargetAt: number | null = null;
  const stop = () => {
    if (frame != null) cancelAnimationFrame(frame);
    frame = null;
  };
  const to = (target: Pose) => {
    const startAt = now();
    const since = lastTargetAt != null ? startAt - lastTargetAt : GLIDE_MAX_MS;
    lastTargetAt = startAt;
    stop();
    const from = shown;
    if (!from || metresBetween(from, target) > JUMP_M) {
      shown = target;
      draw(target, true);
      return;
    }
    const duration = glideMs(since);
    const step = () => {
      const t = Math.min(1, (now() - startAt) / duration);
      shown = lerpPose(from, target, t);
      draw(shown, t >= 1);
      frame = t < 1 ? requestAnimationFrame(step) : null;
    };
    step();
  };
  return { to, stop };
}

/**
 * The pose to draw, gliding towards `target` at about `fps` frames a second.
 * For the phone app's map, where each frame is a React update (so kept modest).
 */
export function useGlide(target: Pose | null, fps = 20): Pose | null {
  const [pose, setPose] = useState<Pose | null>(target);
  const g = useRef<ReturnType<typeof glider> | null>(null);
  useEffect(() => {
    let lastDrawAt = 0;
    const made = glider((p, done) => {
      // Throttled to fps, but the last frame of a glide always drawn.
      const t = Date.now();
      if (!done && t - lastDrawAt < 1000 / fps) return;
      lastDrawAt = t;
      setPose(p);
    });
    g.current = made;
    return () => made.stop();
  }, [fps]);
  const lng = target?.lng;
  const lat = target?.lat;
  const course = target?.course ?? null;
  useEffect(() => {
    if (lng == null || lat == null) return;
    g.current?.to({ lng, lat, course });
  }, [lng, lat, course]);
  return target ? pose : null;
}
