/** [longitude, latitude], the order GeoJSON and MapLibre use. */
export type LngLat = [number, number];

const EARTH_RADIUS_M = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from north, 0–360. */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
    Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Signed change of direction from heading h1 to h2: positive is a right turn. */
export function turnAngle(h1: number, h2: number): number {
  return ((h2 - h1 + 540) % 360) - 180;
}

/** Decodes a Valhalla polyline (6 decimal places) to [lng, lat] points. */
export function decodePolyline6(encoded: string): LngLat[] {
  const points: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push([lng / 1e6, lat / 1e6]);
  }
  return points;
}

/** Running distance in metres to each point of a polyline. */
export function cumulativeDistances(points: LngLat[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1]! + distanceM(points[i - 1]!, points[i]!));
  }
  return out;
}

/**
 * The point a given distance along a polyline, with the direction of travel
 * there. `along` is clamped to the line.
 */
export function pointAlong(
  points: LngLat[],
  cumulative: number[],
  along: number,
): { point: LngLat; heading: number } {
  const last = points.length - 1;
  const target = Math.max(0, Math.min(along, cumulative[last]!));
  let i = 1;
  while (i < last && cumulative[i]! < target) i++;
  const a = points[i - 1]!;
  const b = points[i]!;
  const span = cumulative[i]! - cumulative[i - 1]!;
  const t = span > 0 ? (target - cumulative[i - 1]!) / span : 0;
  return {
    point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    heading: bearingDeg(a, b),
  };
}
