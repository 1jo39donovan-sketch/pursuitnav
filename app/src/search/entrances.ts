// Which way into a building to route to, from OpenStreetMap's entrances by
// the door picked: the one for the flat if the address has one and OSM says
// which entrance serves it; else the one with the house number; else the
// main entrance; else the nearest. Pure, so it can be tested.
import type { Entrance } from "../api/entrances";

const KIND_RANK: Record<string, number> = { main: 0, yes: 1, entrance: 1, home: 1, staircase: 2, secondary: 3, service: 4 };

/** The house number and flat in an address such as "Flat 3, 54 Caledonian Road". */
export function addressParts(label: string): { housenumber: string | null; flat: number | null } {
  const flat = /\b(?:flat|apartment|apt|unit)\s+(\d+)/i.exec(label);
  const rest = flat ? label.slice(flat.index + flat[0].length) : label;
  const number = /(?:^|[\s,])(\d+[A-Za-z]?)\s+[A-Za-z]/.exec(rest);
  return { housenumber: number ? number[1]!.toLowerCase() : null, flat: flat ? Number(flat[1]) : null };
}

/** Whether a flats list such as "1-24", "1-10;12" or "25" includes the flat. */
export function servesFlat(flats: string, flat: number): boolean {
  return flats.split(/[;,]/).some((part) => {
    const range = /^\s*(\d+)\s*[-–]\s*(\d+)\s*$/.exec(part);
    if (range) return flat >= Number(range[1]) && flat <= Number(range[2]);
    return Number(part.trim()) === flat;
  });
}

export function bestEntrance(entrances: readonly Entrance[], label: string): Entrance | null {
  if (!entrances.length) return null;
  const { housenumber, flat } = addressParts(label);
  const score = (e: Entrance) => {
    const forFlat = flat != null && e.flats && servesFlat(e.flats, flat) ? 0 : 1;
    const forNumber = housenumber && e.housenumber.toLowerCase() === housenumber ? 0 : 1;
    return [forFlat, forNumber, KIND_RANK[e.kind] ?? 5, e.metres];
  };
  return [...entrances].sort((a, b) => {
    const [x, y] = [score(a), score(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
    return 0;
  })[0]!;
}

/** "Main entrance A · flats 1–24", for the route card. */
export function entranceLabel(e: Entrance): string {
  const what = e.kind === "main" ? "Main entrance" : e.kind === "staircase" ? "Stair entrance" : "Entrance";
  const id = e.ref || e.name;
  const parts = [id ? `${what} ${id}` : what];
  if (e.flats) parts.push(`flats ${e.flats.replace(/-/g, "–")}`);
  else if (e.housenumber) parts.push(`no. ${e.housenumber}`);
  return parts.join(" · ");
}
