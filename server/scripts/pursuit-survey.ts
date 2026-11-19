// How often Pursuit knows the road, its limit and the next junction, along
// real routes: plans each route on the local Valhalla, samples a point every
// 100 m (with a few metres of GPS-like scatter), and asks Pursuit as the
// phone would. Prints the share found and where it failed. Test routes only.
import { bearingDeg, distanceM, type LngLat } from "../src/geo.js";
import { pursuitInfo } from "../src/pursuit.js";
import { standardFor } from "../src/costing.js";
import { ValhallaClient } from "../src/valhalla.js";

const valhalla = new ValhallaClient(process.env.VALHALLA_URL ?? "http://localhost:8002");
const ROUTES: Record<string, [LngLat, LngLat]> = {
  "Holloway Road → Whitechapel": [[-0.117, 51.556], [-0.0555, 51.5212]],
  "Camden Town → Angel → Old Street": [[-0.1426, 51.5392], [-0.0877, 51.5257]],
  "Stoke Newington → Dalston → Hackney": [[-0.0773, 51.5615], [-0.0555, 51.5450]],
};
const costing = standardFor("car");

/** The point `m` metres along the line. */
function along(shape: LngLat[], m: number): LngLat {
  let left = m;
  for (let i = 1; i < shape.length; i++) {
    const d = distanceM(shape[i - 1]!, shape[i]!);
    if (d >= left) {
      const f = d ? left / d : 0;
      return [shape[i - 1]![0] + (shape[i]![0] - shape[i - 1]![0]) * f, shape[i - 1]![1] + (shape[i]![1] - shape[i - 1]![1]) * f];
    }
    left -= d;
  }
  return shape.at(-1)!;
}

// A few metres of scatter, the same each run.
let seed = 7;
const jitter = (p: LngLat): LngLat => {
  seed = (seed * 9301 + 49297) % 233280;
  const a = (seed / 233280) * 2 * Math.PI;
  const r = 4 / 111_320;
  return [p[0] + (Math.cos(a) * r) / Math.cos((p[1] * Math.PI) / 180), p[1] + Math.sin(a) * r];
};

let all = 0, roads = 0, limits = 0, junctions = 0;
for (const [label, [from, to]] of Object.entries(ROUTES)) {
  const route = await valhalla.route({ costing, from: { point: from }, to: { point: to } });
  const shape = route.shape as LngLat[];
  let length = 0;
  for (let i = 1; i < shape.length; i++) length += distanceM(shape[i - 1]!, shape[i]!);
  let n = 0, r = 0, l = 0, j = 0;
  const misses: string[] = [];
  for (let m = 100; m < length - 50; m += 100) {
    const trace = [along(shape, m - 40), along(shape, m - 20), along(shape, m)].map(jitter);
    const info = await pursuitInfo(valhalla, trace, bearingDeg(along(shape, m - 20), along(shape, m)));
    n++;
    if (info.road) r++;
    if (info.speedLimitMph) l++;
    if (info.nextJunction) j++;
    else misses.push(`${m} m: ${info.road ?? "(no road)"} at ${trace.at(-1)![1].toFixed(5)},${trace.at(-1)![0].toFixed(5)}`);
  }
  console.log(`\n=== ${label}: ${(length / 1000).toFixed(1)} km, ${n} points`);
  console.log(`road ${r}/${n} · limit ${l}/${n} · junction ${j}/${n}`);
  for (const miss of misses.slice(0, 12)) console.log("  no junction:", miss);
  all += n; roads += r; limits += l; junctions += j;
}
const pc = (x: number) => `${Math.round((100 * x) / all)}%`;
console.log(`\nALL: ${all} points · road ${pc(roads)} · limit ${pc(limits)} · junction ${pc(junctions)}`);
