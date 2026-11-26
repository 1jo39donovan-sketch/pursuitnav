// Can a crew route to every A&E, now? Plans both routes, as the server does,
// to each hospital the app offers as Nearest A&E (its A&E entrance when one
// is mapped), from points about 1.5 km north and south of it. Reports any
// with no route, a route that ends short of the door, or one that needs a
// private gate or road. Routes leave "now", so timed restrictions apply:
// the time is printed. Public places only.
import { readFileSync } from "node:fs";

import { withAeCorrections } from "../../app/src/area/emergencyDepartments.ts";
import { parsePlacesFile } from "../../app/src/search/places.ts";
import { aeDestination, isAE } from "../../app/src/search/quickPlaces.ts";
import { distanceM, type LngLat } from "../src/geo.js";
import { planRoutes } from "../src/plan.js";
import { ValhallaClient } from "../src/valhalla.js";

const valhalla = new ValhallaClient(process.env.VALHALLA_URL ?? "http://localhost:8002");
const opts = { minSavingSeconds: 30, minSavingFraction: 0.05, restrictionCheckBudget: 150 };
// Further than this from the A&E point, the route stops short of it.
const SHORT_M = 120;

const places = withAeCorrections(parsePlacesFile(readFileSync(process.argv[2]!, "utf8")).places);
const hospitals = places.filter(isAE);
const now = new Date();
console.log(`${hospitals.length} A&Es; planned at ${now.toISOString().slice(11, 16)} UTC on ${now.toISOString().slice(0, 10)}`);

let ok = 0;
const problems: string[] = [];
for (const h of hospitals) {
  const to = aeDestination(h, places);
  const target: LngLat = [to.lng, to.lat];
  for (const [side, dLat] of [["north", 0.0135], ["south", -0.0135]] as const) {
    const from: LngLat = [to.lng, to.lat + dLat];
    try {
      const plan = await planRoutes(valhalla, from, target, opts);
      const end = plan.standard.shape.at(-1)!;
      const gap = Math.round(distanceM(end, target));
      const notes = [
        plan.endsNearby ? "ends at the nearest road open now" : "",
        gap > SHORT_M ? `standard route ends ${gap} m from the A&E point` : "",
        plan.standard.privateAccess?.length ? `standard needs private access (${plan.standard.privateAccess.map((p) => p.kind).join(", ")})` : "",
      ].filter(Boolean);
      if (notes.length) problems.push(`${to.name} (${h.borough}) from the ${side}: ${notes.join("; ")}`);
      else ok++;
    } catch (e) {
      // From 300 m to the side: tells a test point with no way out (a
      // pedestrian street) from an A&E that can't be reached.
      const aside: LngLat = [from[0] + 0.0043, from[1]];
      const fromAside = await planRoutes(valhalla, aside, target, opts).then(() => true, () => false);
      problems.push(`${fromAside ? "(test point only: fine from 300 m east) " : ""}` +`${to.name} (${h.borough}) from the ${side}: NO ROUTE (${(e as Error).message}); A&E point ${to.lat.toFixed(5)},${to.lng.toFixed(5)}, from ${from[1].toFixed(5)},${from[0].toFixed(5)}`);
    }
  }
}
console.log(`\n${ok} of ${hospitals.length * 2} trips fine.`);
for (const p of problems) console.log("  " + p);
