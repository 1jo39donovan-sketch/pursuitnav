// The two ways of routing. Option names are from Valhalla 3.9's costing
// code (src/sif/dynamiccost.cc, autocost.cc).

/** Fully legal car routing. */
export const STANDARD = {
  costing: "auto",
  options: {},
} as const;

/**
 * Bus costing so bus lanes, bus-only roads and bus gates are usable.
 *
 * - ignore_restrictions: turn restrictions (no right turn, left turn only…)
 *   are ignored. Valhalla also skips every other access restriction with it,
 *   including height, width and weight limits, so the dimensions below have
 *   no effect while it is on. They are kept so a car-sized vehicle is what
 *   gets costed if that option is ever turned off.
 * - ignore_oneways: false keeps one-way streets one-way. Bus contraflow lanes
 *   are still open to bus costing; planRoutes() finds and removes those.
 */
export const POLICE = {
  costing: "bus",
  options: {
    ignore_restrictions: true,
    ignore_oneways: false,
    height: 1.6,
    width: 1.9,
    length: 4.9,
    weight: 2.0,
  },
} as const;

export type Costing = typeof STANDARD | typeof POLICE;
