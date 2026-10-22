// British National Grid (EPSG:27700) easting/northing to WGS84 latitude and
// longitude, for OS Names results (which come only in BNG). The inverse
// Transverse Mercator projection on the Airy 1830 ellipsoid gives OSGB36
// coordinates (OS, "A guide to coordinate systems in Great Britain", C.2), and
// a 7-parameter Helmert transformation takes them to WGS84. Good to a few
// metres across Great Britain, which is plenty for postcodes, roads and
// places. (OS's OSTN15 grid would give centimetres; we don't need them.)

const AIRY = { a: 6377563.396, b: 6356256.909 };
const WGS84 = { a: 6378137, b: 6356752.3141 };

// National Grid projection constants.
const F0 = 0.9996012717;
const LAT0 = (49 * Math.PI) / 180;
const LON0 = (-2 * Math.PI) / 180;
const E0 = 400000;
const N0 = -100000;

// OSGB36 to WGS84: the negation of OS's published WGS84 → OSGB36 parameters.
const TX = 446.448;
const TY = -125.157;
const TZ = 542.06;
const S = -20.4894e-6;
const SEC = Math.PI / (180 * 3600);
const RX = 0.1502 * SEC;
const RY = 0.247 * SEC;
const RZ = 0.8421 * SEC;

/** Inverse projection: BNG easting/northing to OSGB36 latitude/longitude, radians. */
export function gridToOsgb36(e: number, n: number): { lat: number; lon: number } {
  const { a, b } = AIRY;
  const e2 = 1 - (b * b) / (a * a);
  const nn = (a - b) / (a + b);
  const meridional = (lat: number) =>
    b *
    F0 *
    ((1 + nn + (5 / 4) * nn ** 2 + (5 / 4) * nn ** 3) * (lat - LAT0) -
      (3 * nn + 3 * nn ** 2 + (21 / 8) * nn ** 3) * Math.sin(lat - LAT0) * Math.cos(lat + LAT0) +
      ((15 / 8) * nn ** 2 + (15 / 8) * nn ** 3) * Math.sin(2 * (lat - LAT0)) * Math.cos(2 * (lat + LAT0)) -
      (35 / 24) * nn ** 3 * Math.sin(3 * (lat - LAT0)) * Math.cos(3 * (lat + LAT0)));

  let lat = LAT0;
  let m = 0;
  do {
    lat = (n - N0 - m) / (a * F0) + lat;
    m = meridional(lat);
  } while (Math.abs(n - N0 - m) >= 0.00001);

  const sin = Math.sin(lat);
  const cos = Math.cos(lat);
  const tan = Math.tan(lat);
  const nu = (a * F0) / Math.sqrt(1 - e2 * sin * sin);
  const rho = (a * F0 * (1 - e2)) / (1 - e2 * sin * sin) ** 1.5;
  const eta2 = nu / rho - 1;
  const sec = 1 / cos;

  const VII = tan / (2 * rho * nu);
  const VIII = (tan / (24 * rho * nu ** 3)) * (5 + 3 * tan ** 2 + eta2 - 9 * tan ** 2 * eta2);
  const IX = (tan / (720 * rho * nu ** 5)) * (61 + 90 * tan ** 2 + 45 * tan ** 4);
  const X = sec / nu;
  const XI = (sec / (6 * nu ** 3)) * (nu / rho + 2 * tan ** 2);
  const XII = (sec / (120 * nu ** 5)) * (5 + 28 * tan ** 2 + 24 * tan ** 4);
  const XIIA = (sec / (5040 * nu ** 7)) * (61 + 662 * tan ** 2 + 1320 * tan ** 4 + 720 * tan ** 6);

  const de = e - E0;
  return {
    lat: lat - VII * de ** 2 + VIII * de ** 4 - IX * de ** 6,
    lon: LON0 + X * de - XI * de ** 3 + XII * de ** 5 - XIIA * de ** 7,
  };
}

function toCartesian(lat: number, lon: number, { a, b }: { a: number; b: number }) {
  const e2 = 1 - (b * b) / (a * a);
  const nu = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  return {
    x: nu * Math.cos(lat) * Math.cos(lon),
    y: nu * Math.cos(lat) * Math.sin(lon),
    z: nu * (1 - e2) * Math.sin(lat),
  };
}

function fromCartesian({ x, y, z }: { x: number; y: number; z: number }, { a, b }: { a: number; b: number }) {
  const e2 = 1 - (b * b) / (a * a);
  const p = Math.sqrt(x * x + y * y);
  let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 10; i++) {
    const nu = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    lat = Math.atan2(z + e2 * nu * Math.sin(lat), p);
  }
  return { lat, lon: Math.atan2(y, x) };
}

/** BNG easting/northing (metres) to WGS84 { lat, lng } in degrees. */
export function bngToWgs84(easting: number, northing: number): { lat: number; lng: number } {
  const osgb = gridToOsgb36(easting, northing);
  const { x, y, z } = toCartesian(osgb.lat, osgb.lon, AIRY);
  const wgs = fromCartesian(
    {
      x: TX + (1 + S) * x - RZ * y + RY * z,
      y: TY + RZ * x + (1 + S) * y - RX * z,
      z: TZ - RY * x + RX * y + (1 + S) * z,
    },
    WGS84,
  );
  return { lat: (wgs.lat * 180) / Math.PI, lng: (wgs.lon * 180) / Math.PI };
}

/** Greater London in BNG, [xmin, ymin, xmax, ymax], with a margin: OS Names searches are kept to it. */
export const LONDON_BNG_BOUNDS: [number, number, number, number] = [500000, 150000, 565000, 205000];
