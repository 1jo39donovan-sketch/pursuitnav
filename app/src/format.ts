/** "8 min", "1 h 05 min"; under ten minutes "4 min 30 s" for precision. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 600) {
    const sec = s % 60;
    return sec ? `${Math.floor(s / 60)} min ${sec} s` : `${s / 60} min`;
  }
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`;
}

/** UK roads: miles, with yards for short distances. */
export function formatDistance(metres: number): string {
  const miles = metres / 1609.344;
  if (miles < 0.1) return `${Math.round(metres * 1.0936 / 10) * 10} yd`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/** A road number such as A1, A503, B550, M25 or A40(M): OSM gives it alongside the name, in either order. */
const ROAD_NUMBER = /^[ABM]\d+(\(M\))?$/i;

/** The road as the crew says it: "Holloway Road / A1", or the name or number alone (null when unnamed). */
export function roadLabel(names: readonly string[]): string | null {
  const name = names.find((n) => !ROAD_NUMBER.test(n.trim()));
  const number = names.find((n) => ROAD_NUMBER.test(n.trim()));
  const ref = number?.toUpperCase();
  if (name && ref) return `${name} / ${ref}`;
  return name ?? ref ?? null;
}
