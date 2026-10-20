// The two ways of routing, sized to the vehicle being driven. Option names
// are from Valhalla 3.9's costing code (src/sif/dynamiccost.cc, autocost.cc).

export const VEHICLE_TYPES = ["car", "suv", "van", "carrier", "ambulance", "fire"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

interface Dimensions {
  /** Metres, including a roof light bar. */
  height: number;
  /** Metres, body without mirrors (how OSM maxwidth is signed). */
  width: number;
  /** Metres. */
  length: number;
  /** Tonnes, gross. */
  weight: number;
}

// Typical emergency-service vehicles, rounded up so a limit is never cut fine.
export const VEHICLES: Record<VehicleType, Dimensions> = {
  car: { height: 1.6, width: 1.9, length: 4.9, weight: 2.0 },
  suv: { height: 1.9, width: 2.0, length: 5.0, weight: 2.7 },
  van: { height: 2.6, width: 2.1, length: 6.0, weight: 3.5 },
  carrier: { height: 3.0, width: 2.2, length: 7.0, weight: 5.0 },
  ambulance: { height: 3.0, width: 2.3, length: 6.6, weight: 5.0 },
  fire: { height: 3.4, width: 2.55, length: 9.0, weight: 16.0 },
};

/**
 * Main roads (the default) or any roads. Main roads are quicker on blue
 * lights (room to overtake, bus lanes) and the map's travel speeds already
 * favour them. "Any" weighs distance heavily too, so a shorter way through
 * side streets wins unless a main road is much quicker.
 */
export const ROAD_CHOICES = ["main", "any"] as const;
export type RoadChoice = (typeof ROAD_CHOICES)[number];
const ANY_ROADS = { use_distance: 0.8 };

export interface Costing {
  costing: "auto" | "bus";
  options: Readonly<Record<string, number | boolean>>;
}

const cache = new Map<string, Costing>();
const once = (key: string, make: () => Costing) => cache.get(key) ?? cache.set(key, make()).get(key)!;

/** Fully legal routing, avoiding height, width, length and weight limits the vehicle can't take. */
export const standardFor = (vehicle: VehicleType, roads: RoadChoice = "main"): Costing =>
  once(`standard:${vehicle}:${roads}`, () => ({
    costing: "auto",
    options: { ...VEHICLES[vehicle], ...(roads === "any" ? ANY_ROADS : {}) },
  }));

/**
 * Bus costing so bus lanes, bus-only roads and bus gates are usable.
 *
 * - ignore_restrictions: turn restrictions (no right turn, left turn only…)
 *   are ignored. Valhalla also skips every other access restriction with it,
 *   including height, width and weight limits, so the dimensions here have no
 *   effect: planRoutes() finds limits the vehicle can't take and routes
 *   round them. (ignore_non_vehicular_restrictions keeps those limits but
 *   obeys turn restrictions too, so it can't be used instead.)
 * - ignore_oneways: false keeps one-way streets one-way. Bus contraflow lanes
 *   are still open to bus costing; planRoutes() finds and removes those.
 */
export const policeFor = (vehicle: VehicleType, roads: RoadChoice = "main"): Costing =>
  once(`police:${vehicle}:${roads}`, () => ({
    costing: "bus",
    options: {
      ignore_restrictions: true,
      ignore_oneways: false,
      ...VEHICLES[vehicle],
      ...(roads === "any" ? ANY_ROADS : {}),
    },
  }));

/**
 * A legal car too small for any size or weight limit to apply. Comparing it
 * with the real vehicle tells a size limit apart from a bus-only road, and
 * checks one-way streets independently of size.
 */
export const UNSIZED: Costing = {
  costing: "auto",
  options: { height: 1.0, width: 1.0, length: 2.0, weight: 0.5 },
};

/** A police car: the default when the app doesn't say. */
export const STANDARD = standardFor("car");
export const POLICE = policeFor("car");
