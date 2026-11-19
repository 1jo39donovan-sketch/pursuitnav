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
  const names = matched?.names ?? [];
  const start = ahead.some((e) => e.car) ? ahead : r1.some((e) => e.car) ? r1 : r2;
  let edge = start
    .filter((e) => e.car && e.shape.length >= 2)
    .sort((a, b) => Number(b.names.some((n) => names.includes(n))) - Number(a.names.some((n) => names.includes(n))) || Math.abs(turnAngle(dir, a.heading)) - Math.abs(turnAngle(dir, b.heading)))[0];
  for (let step = 0; edge && step < 12; step++) {
    const node = edge.shape.at(-1)!;
    const arriving = bearingDeg(edge.shape.at(-2)!, node);
    const atNode = await valhalla.locate(node);
    console.log(` step ${step}: on ${brief(edge)} -> node ${node[1].toFixed(5)},${node[0].toFixed(5)} arriving ${Math.round(arriving)}`);
    for (const e of atNode.slice(0, 10)) console.log("    at node:", brief(e), `turn=${Math.round(turnAngle(arriving, e.heading))}`);
    edge = atNode
      .filter((e) => e.car && e.percentAlong < 0.01 && e.shape.length >= 2 && (!names.length || e.names.some((n) => names.includes(n))))
      .filter((e) => Math.abs(turnAngle(arriving, e.heading)) < 60)
      .sort((a, b) => Math.abs(turnAngle(arriving, a.heading)) - Math.abs(turnAngle(arriving, b.heading)))[0];
    if (!edge) console.log("    (no onward edge on the same road: the search stops here)");
  }
}
