// The track a team member shares: where they've driven lately, so a colleague
// can follow them in. Kept in memory on the phone while in a team, never stored.
import { distanceM } from "../geo";

export interface TrackPoint {
  lat: number;
  lng: number;
  /** ms since 1970 */
  at: number;
}

// One point every 25 m is plenty to match to the roads; 400 of them is ~10 km.
const MIN_GAP_M = 25;
const MAX_POINTS = 400;
const MAX_AGE_MS = 2 * 3600_000;

/** The track with a new fix added, if it has moved far enough. */
export function addFix(track: TrackPoint[], fix: TrackPoint): TrackPoint[] {
  const last = track[track.length - 1];
  if (last && distanceM(last, fix) < MIN_GAP_M) return track;
  const kept = track.filter((p) => fix.at - p.at <= MAX_AGE_MS);
  return [...kept.slice(Math.max(0, kept.length - MAX_POINTS + 1)), fix];
}

/** Compact form for sharing: whole 1e-5 degrees (~1 m), each point as the change from the last. */
export function encodeTrack(track: TrackPoint[]): number[] {
  const out: number[] = [];
  let lat = 0;
  let lng = 0;
  for (const p of track) {
    const a = Math.round(p.lat * 1e5);
    const b = Math.round(p.lng * 1e5);
    out.push(a - lat, b - lng);
    lat = a;
    lng = b;
  }
  return out;
}

export function decodeTrack(encoded: unknown): { lat: number; lng: number }[] {
  if (!Array.isArray(encoded)) return [];
  const out: { lat: number; lng: number }[] = [];
  let lat = 0;
  let lng = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    const a = Number(encoded[i]);
    const b = Number(encoded[i + 1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
    lat += a;
    lng += b;
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}
