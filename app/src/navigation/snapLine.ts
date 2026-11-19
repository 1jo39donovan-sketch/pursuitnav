// Puts a GPS position on the line of a road, when it's close: the arrow is
// drawn on the road rather than on the pavement or in the buildings beside it.
const M_PER_DEG = 111_320;

/**
 * The nearest point on `line` ([lng, lat], in the direction of travel) to
 * `pos`, if within `maxM` metres and not past either end of it (past the end,
 * the car has left this stretch: it's drawn where GPS says). Null otherwise.
 */
export function snapToLine(
  pos: { lat: number; lng: number },
  line: readonly (readonly [number, number])[] | null | undefined,
  maxM = 30,
): { lng: number; lat: number; course: number } | null {
  if (!line || line.length < 2) return null;
  const cosLat = Math.cos((pos.lat * Math.PI) / 180);
  const px = pos.lng * M_PER_DEG * cosLat;
  const py = pos.lat * M_PER_DEG;
  let best: { d: number; x: number; y: number; course: number; past: boolean } | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i]![0] * M_PER_DEG * cosLat;
    const ay = line[i]![1] * M_PER_DEG;
    const bx = line[i + 1]![0] * M_PER_DEG * cosLat;
    const by = line[i + 1]![1] * M_PER_DEG;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const raw = ((px - ax) * dx + (py - ay) * dy) / len2;
    const t = Math.max(0, Math.min(1, raw));
    const x = ax + t * dx;
    const y = ay + t * dy;
    const d = Math.hypot(px - x, py - y);
    // Before the first point or beyond the last: off this stretch altogether.
    const past = (i === 0 && raw < 0) || (i === line.length - 2 && raw > 1);
    if (!best || d < best.d) {
      best = { d, x, y, course: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360, past };
    }
  }
  if (!best || best.past || best.d > maxM) return null;
  return { lng: best.x / (M_PER_DEG * cosLat), lat: best.y / M_PER_DEG, course: best.course };
}
