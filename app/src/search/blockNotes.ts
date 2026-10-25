// The crew's own notes on a block or building ("Entrance round the back,
// lift to 4th floor, flats 1–24"), kept on this phone only and shown on the
// route card whenever they're sent there again.
import { store } from "../storage/store";

export interface BlockNote {
  lat: number;
  lng: number;
  /** What it was saved against, e.g. "Smith House" or "54 Caledonian Road". */
  name: string;
  note: string;
}

const KEY = "blockNotes";
/** The same block: within about 40 m (an entrance or the middle of the building). */
const NEAR_M = 40;

const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((b.lat - a.lat) * 111_320, (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

export function parseNotes(text: string | null): BlockNote[] {
  try {
    const list: unknown = JSON.parse(text ?? "[]");
    return Array.isArray(list)
      ? list.filter(
          (n): n is BlockNote =>
            !!n && typeof n.note === "string" && typeof n.name === "string" && Number.isFinite(n.lat) && Number.isFinite(n.lng),
        )
      : [];
  } catch {
    return [];
  }
}

/** The nearest note within ~40 m of the point, if any. */
export function noteNear(list: readonly BlockNote[], at: { lat: number; lng: number }): BlockNote | null {
  let best: BlockNote | null = null;
  let bestM = NEAR_M;
  for (const n of list) {
    const m = metres(at, n);
    if (m <= bestM) {
      best = n;
      bestM = m;
    }
  }
  return best;
}

/** The note for this place written (replacing the one near it), or removed when empty. */
export function withNote(list: readonly BlockNote[], at: { lat: number; lng: number; name: string }, note: string): BlockNote[] {
  const old = noteNear(list, at);
  const rest = list.filter((n) => n !== old);
  const text = note.trim();
  return text ? [{ lat: old?.lat ?? at.lat, lng: old?.lng ?? at.lng, name: old?.name ?? at.name, note: text }, ...rest] : rest;
}

export const loadNotes = () => parseNotes(store.getSetting(KEY));
export const saveNotes = (list: BlockNote[]) => store.setSetting(KEY, JSON.stringify(list));
