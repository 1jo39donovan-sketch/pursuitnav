// Which way the vehicle is facing, for the arrow on the maps and heading-up
// views. GPS gives a direction only while moving, and it's noise below a
// walking pace, so: the direction of travel while moving; the last one when
// stopped (at lights, say); the phone's compass before it has moved at all;
// otherwise unknown, and the map shows a dot.

// GPS course is noise when standing still or walking.
export const MOVING_MS = 2;

export function isMoving(fix: { speed: number | null; course: number | null }): boolean {
  return fix.course != null && fix.speed != null && fix.speed >= MOVING_MS;
}

/** Degrees clockwise from true north, or null when there's nothing to go on. */
export function facing(
  fix: { speed: number | null; course: number | null } | null,
  lastCourse: number | null,
  compass: number | null,
): number | null {
  if (fix && isMoving(fix)) return fix.course;
  return lastCourse ?? compass;
}
