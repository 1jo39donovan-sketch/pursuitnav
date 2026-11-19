// Prints what Pursuit sees on a test drive, step by step: the road matched,
// the edges at the car, and each node the junction search passes. For
// finding why "Approaching junction" shows "—". Run by the "Pursuit debug"
// workflow against a local Valhalla on the published map; test points only.
import { bearingDeg, turnAngle, type LngLat } from "../src/geo.js";
import { pursuitInfo } from "../src/pursuit.js";
import { ValhallaClient } from "../src/valhalla.js";

const valhalla = new ValhallaClient(process.env.VALHALLA_URL ?? "http://localhost:8002");
const drives: Record<string, LngLat[]> = JSON.parse(process.argv[2] ?? "{}");
const brief = (e: { names: string[]; use: string; car: boolean; heading: number; percentAlong: number; lengthM: number }) =>
  `${e.names.join("/") || "(no name)"} use=${e.use} car=${e.car} hdg=${Math.round(e.heading)} along=${e.percentAlong.toFixed(2)} len=${Math.round(e.lengthM)}`;

for (const [label, trace] of Object.entries(drives)) {
  console.log(`\n=== ${label}`);
  console.log("pursuitInfo:", JSON.stringify({ ...(await pursuitInfo(valhalla, trace)), roadShape: undefined }));
  const here = trace.at(-1)!;
  const dir = bearingDeg(trace.at(-2)!, here);
  const matched = await valhalla.matchRoad(trace);
  console.log(`dir=${Math.round(dir)} matched=${JSON.stringify(matched?.names)}`);
  const ahead = await valhalla.locate(here, dir);
  for (const e of ahead.slice(0, 8)) console.log("  at car:", brief(e));
  const anyWay = await valhalla.locate(here);
  for (const e of anyWay.slice(0, 8)) console.log("  at car, no direction:", brief(e), `turn=${Math.round(turnAngle(dir, e.heading))}`);
  // A little along the line too, in case the car's point is between two roads.
  for (const m of [15, 30]) {
    const f = m / 111_320;
    const p: LngLat = [here[0] + Math.sin((dir * Math.PI) / 180) * f / Math.cos((here[1] * Math.PI) / 180), here[1] + Math.cos((dir * Math.PI) / 180) * f];
    const e = await valhalla.locate(p, dir);
    console.log(`  ${m} m on, with direction:`, e.slice(0, 3).map(brief).join(" ; ") || "(none)");
  }
  const r1 = await valhalla.locate(here, dir, { radiusM: 30, publicRoads: true });
  for (const e of r1.slice(0, 6)) console.log("  30 m public, with direction:", brief(e));
  if (!r1.length) console.log("  30 m public, with direction: (none)");
  const r2 = await valhalla.locate(here, undefined, { radiusM: 30, publicRoads: true });
  for (const e of r2.slice(0, 6)) console.log("  30 m public, no direction:", brief(e), `turn=${Math.round(turnAngle(dir, e.heading))}`);
  if (!r2.length) console.log("  30 m public, no direction: (none)");

}
