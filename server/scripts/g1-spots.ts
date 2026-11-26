// Places where the blue-light route should appear, on the published map:
// for checking gate G1 (a blue-light route on a real phone) without guessing
// where to stand. Plans each pair as the server does and prints whether the
// blue-light route is offered, the time saved and each restriction it uses.
// Test points only (public places), no one's position.
import { planRoutes } from "../src/plan.js";
import { ValhallaClient } from "../src/valhalla.js";
import type { LngLat } from "../src/geo.js";

const valhalla = new ValhallaClient(process.env.VALHALLA_URL ?? "http://localhost:8002");
const opts = { minSavingSeconds: 30, minSavingFraction: 0.05, restrictionCheckBudget: 150 };

const PAIRS: Record<string, [LngLat, LngLat]> = {
  "Brixton (Atlantic Road) → Herne Hill station": [[-0.1135, 51.46], [-0.1023, 51.4533]],
  "Herne Hill station → Brixton station": [[-0.1023, 51.4533], [-0.1146, 51.4626]],
  "Spitalfields (Commercial Street) → Liverpool Street station": [[-0.0752, 51.5197], [-0.0823, 51.5178]],
  "Shoreditch High Street → Bank": [[-0.0776, 51.5236], [-0.0886, 51.5133]],
  "Goodge Street station → Tottenham Court Road station": [[-0.1347, 51.5205], [-0.1307, 51.5165]],
  "Euston station → Holborn station": [[-0.1337, 51.5282], [-0.1199, 51.5174]],
  "Angel → Highbury Corner": [[-0.1057, 51.5322], [-0.1035, 51.5463]],
  "Camden Town station → King's Cross": [[-0.1426, 51.5392], [-0.1240, 51.5308]],
  // From where the store screenshots start (Holloway Road by Seven Sisters Road).
  "Holloway Road → 54 Caledonian Road": [[-0.1154, 51.5532], [-0.12009, 51.53224]],
  "Holloway Road → King's Cross station": [[-0.1154, 51.5532], [-0.1238, 51.5302]],
  "Holloway Road → Angel station": [[-0.1154, 51.5532], [-0.1057, 51.5322]],
  "Holloway Road → Highbury Corner": [[-0.1154, 51.5532], [-0.1035, 51.5463]],
  "Holloway Road → Camden Town station": [[-0.1154, 51.5532], [-0.1426, 51.5392]],
  "Holloway Road → Finsbury Park station": [[-0.1154, 51.5532], [-0.1065, 51.5643]],
  "Holloway Road → Euston station": [[-0.1154, 51.5532], [-0.1337, 51.5282]],
  "Holloway Road → Whittington Hospital": [[-0.1154, 51.5532], [-0.1383, 51.5658]],
};

// Routes leave "now": what's offered can change with the hour (timed bus lanes, school streets).
console.log(`Planned at ${new Date().toISOString().slice(11, 16)} UTC on ${new Date().toISOString().slice(0, 10)}`);
for (const [label, [from, to]] of Object.entries(PAIRS)) {
  try {
    const plan = await planRoutes(valhalla, from, to, opts);
    const std = Math.round(plan.standard.durationS / 60);
    const near = plan.endsNearby ? " (ends at the nearest road open now)" : "";
    if (!plan.police) {
      console.log(`\n· ${label}: standard ${std} min${near}; no blue-light route (${plan.noPoliceReason ?? "not faster"})`);
      continue;
    }
    console.log(`\n✓ ${label}: standard ${std} min${near}; blue light saves ${Math.round(plan.police.savingS)} s`);
    for (const r of plan.police.restrictions) console.log(`    ${r.description}  (${r.location.lat.toFixed(5)}, ${r.location.lng.toFixed(5)})`);
  } catch (e) {
    console.log(`\n✗ ${label}: ${(e as Error).message}`);
  }
}
