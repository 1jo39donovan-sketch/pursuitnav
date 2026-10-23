// OS National Grid references from GPS (WGS84) positions, worked out on the
// phone, for "Where am I": what Ordnance Survey maps, the control room's
// mapping and mountain rescue use. The method is Ordnance Survey's own ("A
// guide to coordinate systems in Great Britain"): a Helmert shift to OSGB36
// (good to about 5 m, plenty for a grid reference), then the Transverse
// Mercator projection.

const rad = (d: number) => (d * Math.PI) / 180;

/** WGS84 latitude/longitude to OSGB36, via cartesian coordinates and a 7-parameter Helmert shift. */
export function wgs84ToOsgb36(lat: number, lng: number): { lat: number; lng: number } {
  // GRS80/WGS84 ellipsoid.
  const a1 = 6378137.0;
  const b1 = 6356752.3141;
  const e1 = 1 - (b1 * b1) / (a1 * a1);
  const phi = rad(lat);
  const lam = rad(lng);
  const nu1 = a1 / Math.sqrt(1 - e1 * Math.sin(phi) ** 2);
  const x1 = nu1 * Math.cos(phi) * Math.cos(lam);
  const y1 = nu1 * Math.cos(phi) * Math.sin(lam);
  const z1 = (1 - e1) * nu1 * Math.sin(phi);
  // WGS84 → OSGB36 (OS published values).
  const tx = -446.448;
  const ty = 125.157;
  const tz = -542.06;
  const s = 20.4894e-6;
  const rx = rad(-0.1502 / 3600);
  const ry = rad(-0.247 / 3600);
  const rz = rad(-0.8421 / 3600);
  const x2 = tx + (1 + s) * x1 - rz * y1 + ry * z1;
  const y2 = ty + rz * x1 + (1 + s) * y1 - rx * z1;
  const z2 = tz - ry * x1 + rx * y1 + (1 + s) * z1;
  // Airy 1830 ellipsoid.
  const a2 = 6377563.396;
  const b2 = 6356256.909;
  const e2 = 1 - (b2 * b2) / (a2 * a2);
  const p = Math.hypot(x2, y2);
  let phi2 = Math.atan2(z2, p * (1 - e2));
  for (let i = 0; i < 10; i++) {
    const nu2 = a2 / Math.sqrt(1 - e2 * Math.sin(phi2) ** 2);
    phi2 = Math.atan2(z2 + e2 * nu2 * Math.sin(phi2), p);
  }
  return { lat: (phi2 * 180) / Math.PI, lng: (Math.atan2(y2, x2) * 180) / Math.PI };
}

/** OSGB36 latitude/longitude to National Grid eastings and northings (metres). */
export function osgb36ToGrid(lat: number, lng: number): { e: number; n: number } {
  const a = 6377563.396;
  const b = 6356256.909;
  const f0 = 0.9996012717;
  const phi0 = rad(49);
  const lam0 = rad(-2);
  const n0 = -100000;
  const e0 = 400000;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);
  const phi = rad(lat);
  const lam = rad(lng);
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const nu = (a * f0) / Math.sqrt(1 - e2 * sin * sin);
  const rho = (a * f0 * (1 - e2)) / Math.pow(1 - e2 * sin * sin, 1.5);
  const eta2 = nu / rho - 1;
  const dp = phi - phi0;
  const sp = phi + phi0;
  const m =
    b *
    f0 *
    ((1 + n + (5 / 4) * n * n + (5 / 4) * n ** 3) * dp -
      (3 * n + 3 * n * n + (21 / 8) * n ** 3) * Math.sin(dp) * Math.cos(sp) +
      ((15 / 8) * n * n + (15 / 8) * n ** 3) * Math.sin(2 * dp) * Math.cos(2 * sp) -
      (35 / 24) * n ** 3 * Math.sin(3 * dp) * Math.cos(3 * sp));
  const i = m + n0;
  const ii = (nu / 2) * sin * cos;
  const iii = (nu / 24) * sin * cos ** 3 * (5 - tan * tan + 9 * eta2);
  const iiia = (nu / 720) * sin * cos ** 5 * (61 - 58 * tan * tan + tan ** 4);
  const iv = nu * cos;
  const v = (nu / 6) * cos ** 3 * (nu / rho - tan * tan);
  const vi = (nu / 120) * cos ** 5 * (5 - 18 * tan * tan + tan ** 4 + 14 * eta2 - 58 * tan * tan * eta2);
  const dl = lam - lam0;
  return {
    n: i + ii * dl ** 2 + iii * dl ** 4 + iiia * dl ** 6,
    e: e0 + iv * dl + v * dl ** 3 + vi * dl ** 5,
  };
}

/** Eastings and northings as a grid reference, e.g. "TQ 30046 79676" (10 figures: to the metre). */
export function gridLetters(e: number, n: number, digits = 10): string | null {
  if (e < 0 || n < 0 || e >= 700000 || n >= 1300000) return null;
  const e100k = Math.floor(e / 100000);
  const n100k = Math.floor(n / 100000);
  // The two letters, from the false origin, skipping I.
  let l1 = 19 - n100k - ((19 - n100k) % 5) + Math.floor((e100k + 10) / 5);
  let l2 = (((19 - n100k) * 5) % 25) + (e100k % 5);
  if (l1 > 7) l1++;
  if (l2 > 7) l2++;
  const letters = String.fromCharCode(l1 + 65) + String.fromCharCode(l2 + 65);
  const half = digits / 2;
  const pad = (v: number) =>
    String(Math.floor((v % 100000) / Math.pow(10, 5 - half))).padStart(half, "0");
  return `${letters} ${pad(e)} ${pad(n)}`;
}

/** A GPS position as an OS grid reference, or null outside Great Britain's grid. */
export function osGridRef(lat: number, lng: number): string | null {
  const osgb = wgs84ToOsgb36(lat, lng);
  const { e, n } = osgb36ToGrid(osgb.lat, osgb.lng);
  return gridLetters(e, n);
}
