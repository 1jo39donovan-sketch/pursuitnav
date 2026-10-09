// Server settings, from the environment with sensible defaults.

export interface ServerConfig {
  port: number;
  host: string;
  valhallaUrl: string;
  /** Requests outside this box are refused: [west, south, east, north]. */
  bounds: [number, number, number, number];
  /** The police route is offered only if it saves at least this many seconds… */
  minSavingSeconds: number;
  /** …and at least this fraction of the standard route's time. */
  minSavingFraction: number;
  /** Most Valhalla calls one request may spend finding restrictions. */
  restrictionCheckBudget: number;
  /** OS Places API key; door-level address search is off without it. */
  osPlacesKey: string | undefined;
}

// Greater London with a margin, matching the app's region config.
const LONDON_BOUNDS: ServerConfig["bounds"] = [-0.8, 51.2, 0.6, 51.8];

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got "${raw}"`);
  return value;
}

export function loadConfig(): ServerConfig {
  const bounds = process.env.REGION_BOUNDS
    ? (process.env.REGION_BOUNDS.split(",").map(Number) as ServerConfig["bounds"])
    : LONDON_BOUNDS;
  if (bounds.length !== 4 || bounds.some((n) => !Number.isFinite(n))) {
    throw new Error("REGION_BOUNDS must be west,south,east,north");
  }
  return {
    port: num("PORT", 3000),
    host: process.env.HOST ?? "0.0.0.0",
    valhallaUrl: process.env.VALHALLA_URL ?? "http://localhost:8002",
    bounds,
    minSavingSeconds: num("MIN_SAVING_SECONDS", 30),
    minSavingFraction: num("MIN_SAVING_FRACTION", 0.05),
    restrictionCheckBudget: num("RESTRICTION_CHECK_BUDGET", 150),
    osPlacesKey: process.env.OS_PLACES_KEY || undefined,
  };
}
