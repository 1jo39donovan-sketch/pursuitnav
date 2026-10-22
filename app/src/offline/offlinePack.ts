// The map kept on the phone for when there's no signal (Session, "Map for
// offline use"): what the server offers, whether it suits this region, how
// big and how old it is, and the map styles pointed at the files on the
// phone. No network or files here: offlineMap.ts does the downloading.
//
// Nothing about the area is written here: it comes from the region config,
// so another region needs no change to this code (a test checks).
import type { RegionConfig } from "../config";

/** What GET /v1/offline-map describes (server/src/offlineMap.ts). */
export interface OfflineManifest {
  format: number;
  built: string;
  version: string;
  /** Where the files are, under the server's address. */
  base: string;
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  styles: Record<string, string>;
  bytes: number;
  files: { path: string; bytes: number; sha256: string }[];
}

/** Vector tiles hold every detail by this zoom; the map draws closer zooms from them. */
export const FULL_DETAIL_ZOOM = 14;

/** How the styles name the pack's own files (server/scripts/offline_styles.py). */
export const PACK_PREFIX = "blueroute-pack://";

/** Older than this, Session asks for an update on Wi-Fi. */
export const STALE_DAYS = 30;

export function isManifest(m: unknown): m is OfflineManifest {
  const x = m as Partial<OfflineManifest> | null;
  return (
    !!x &&
    x.format === 1 &&
    typeof x.version === "string" &&
    /^[0-9A-Za-z]+$/.test(x.version) &&
    typeof x.base === "string" &&
    Array.isArray(x.bounds) &&
    x.bounds.length === 4 &&
    Array.isArray(x.files) &&
    typeof x.bytes === "number" &&
    !!x.styles &&
    typeof x.styles.night === "string" &&
    typeof x.styles.day === "string"
  );
}

/**
 * Why this pack won't do for the region, or null if it will: it must cover
 * the whole area the map can show, at the zooms the region needs.
 */
export function unsuitable(m: OfflineManifest, region: RegionConfig): string | null {
  const [w, s, e, n] = m.bounds;
  const [rw, rs, re, rn] = region.maxBounds as [number, number, number, number];
  const slack = 1e-6;
  if (w > rw + slack || s > rs + slack || e < re - slack || n < rn - slack) {
    return `The server's offline map doesn't cover ${region.name}.`;
  }
  const [minZoom, maxZoom] = region.offlineZooms;
  // Closer than full detail, the map draws from the full-detail tiles.
  if (m.minZoom > minZoom || m.maxZoom < Math.min(maxZoom, FULL_DETAIL_ZOOM)) {
    return "The server's offline map doesn't have enough detail.";
  }
  return null;
}

/** "120 MB", for the size shown before downloading. */
export function sizeText(bytes: number): string {
  const mb = bytes / 1e6;
  if (mb < 1) return "under 1 MB";
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  if (mb < 1000) return `${Math.round(mb)} MB`;
  return `${(mb / 1000).toFixed(1)} GB`;
}

/** Whole days since the pack was built. */
export function ageDays(built: string, now: number): number {
  const t = Date.parse(built);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86_400_000)) : 0;
}

/** Said on Session when the pack is getting old, or null. Never updated on mobile data by itself. */
export function staleText(built: string, now: number): string | null {
  const days = ageDays(built, now);
  return days > STALE_DAYS ? `Offline map is ${days} days old: update on Wi-Fi` : null;
}

/** "Downloaded 25 Oct 2026 · 120 MB" */
export function readyText(built: string, bytes: number): string {
  const d = new Date(built);
  const date = Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";
  return `Map of ${date} · ${sizeText(bytes)}`;
}

/** The files still to fetch, given those already on the phone with the right size. */
export function stillToFetch(
  m: OfflineManifest,
  have: (path: string) => number | null,
): { files: OfflineManifest["files"]; bytes: number } {
  const files = m.files.filter((f) => have(f.path) !== f.bytes);
  return { files, bytes: files.reduce((sum, f) => sum + f.bytes, 0) };
}

/**
 * A style from the pack, made to read everything from where the pack is kept
 * (a file:// folder URI). Returns the style's JSON, which the map takes as is.
 */
export function localStyle(styleText: string, folderUri: string): string {
  const base = folderUri.endsWith("/") ? folderUri : `${folderUri}/`;
  // Parsed and written again, so a damaged file fails here, not in the map.
  return JSON.stringify(JSON.parse(styleText.split(PACK_PREFIX).join(base)));
}

/** The pack's files must stay inside its folder. */
export function safePath(path: string): boolean {
  return /^[A-Za-z0-9_@.\-/]+$/.test(path) && !path.split("/").some((p) => p === ".." || p === "");
}
