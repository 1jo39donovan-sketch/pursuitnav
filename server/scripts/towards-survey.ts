// How well Pursuit's "Generally towards" names the next borough, along real
// routes: plans each route on the local Valhalla, and every 100 m compares
// what the app would say (the car's heading projected 0.5–2 km straight on,
// app/src/area/area.ts) with the borough the route really enters next. A
// straight line can cross a boundary the road bends away from. Test routes only.
import { boroughAt, generallyTowards } from "../../app/src/area/area.ts";
import { standardFor } from "../src/costing.js";
import { bearingDeg, distanceM, type LngLat } from "../src/geo.js";
import { ValhallaClient } from "../src/valhalla.js";

const valhalla = new ValhallaClient(process.env.VALHALLA_URL ?? "http://localhost:8002");
const ROUTES: Record<string, [LngLat, LngLat]> = {
  "Holloway Road → Whitechapel": [[-0.117, 51.556], [-0.0555, 51.5212]],
  "Camden Town → Angel → Old Street": [[-0.1426, 51.5392], [-0.0877, 51.5257]],
  "Stoke Newington → Dalston → Hackney": [[-0.0773, 51.5615], [-0.0555, 51.545]],
  "Brixton → Elephant → Bank": [[-0.1145, 51.4613], [-0.0886, 51.5133]],
  "Archway → Camden → Oxford Circus": [[-0.1346, 51.5653], [-0.1415, 51.5154]],
  "Stratford → Mile End → Aldgate": [[-0.0035, 51.5416], [-0.0716, 51.5143]],
};
const costing = standardFor("car");
// The app looks up to 2 km ahead; the route gets a little more, for the bends.
const LOOK_M = 2000;
const SLACK_M = 500;

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
const at = (p: LngLat) => boroughAt(p[1], p[0]);

let n = 0, right = 0, wrong = 0, missed = 0, phantom = 0, quiet = 0;
for (const [label, [from, to]] of Object.entries(ROUTES)) {
  const route = await valhalla.route({ costing, from: { point: from }, to: { point: to } });
  const shape = route.shape as LngLat[];
  let length = 0;
  for (let i = 1; i < shape.length; i++) length += distanceM(shape[i - 1]!, shape[i]!);
  const notes: string[] = [];
  for (let m = 100; m < length - 100; m += 100) {
    const here = along(shape, m);
    const heading = bearingDeg(along(shape, m - 20), here);
    const said = generallyTowards(here[1], here[0], heading);
    const now = at(here);
    // The first other borough the route itself reaches, and how far on.
    let next: { borough: string; m: number } | null = null;
    for (let k = 50; m + k <= Math.min(length, m + LOOK_M + SLACK_M); k += 50) {
      const b = at(along(shape, m + k));
      if (b && b !== now) {
        next = { borough: b, m: k };
        break;
      }
    }
    const saysBorough = said !== null && said === at(projectStraight(here, heading, said));
    n++;
    const where = `${m} m (${now}, heading ${Math.round(heading)})`;
    if (next && next.m <= LOOK_M) {
      if (said === next.borough) right++;
      else if (saysBorough) {
        wrong++;
        notes.push(`wrong: ${where}: says ${said}, route enters ${next.borough} in ${next.m} m`);
      } else {
        missed++;
        notes.push(`missed: ${where}: says ${said ?? "nothing"}, route enters ${next.borough} in ${next.m} m`);
      }
    } else if (saysBorough && said !== next?.borough) {
      phantom++;
      notes.push(`phantom: ${where}: says ${said}, route ${next ? `enters ${next.borough} in ${next.m} m` : "stays in " + now}`);
    } else {
      quiet++;
    }
  }
  console.log(`\n=== ${label}: ${(length / 1000).toFixed(1)} km`);
  for (const line of notes.slice(0, 15)) console.log("  " + line);
}

/** Whether a name is a borough the straight line reaches (the app also names areas). */
function projectStraight(p: LngLat, heading: number, name: string): LngLat {
  for (const m of [500, 1000, 1500, 2000]) {
    const r = (heading * Math.PI) / 180;
    const q: LngLat = [p[0] + (Math.sin(r) * m) / (111_320 * Math.cos((p[1] * Math.PI) / 180)), p[1] + (Math.cos(r) * m) / 111_320];
    if (at(q) === name) return q;
  }
  return p;
}

const pc = (x: number) => `${Math.round((100 * x) / n)}%`;
console.log(`\nALL: ${n} points`);
console.log(`  route crosses within 2 km: named right ${right}, wrong borough ${wrong}, not named ${missed}`);
console.log(`  route doesn't cross: named a borough anyway ${phantom}, nothing or an area ${quiet}`);
console.log(`  right when it matters: ${right}/${right + wrong + missed} · misleading: ${pc(wrong + phantom)} of all points`);
