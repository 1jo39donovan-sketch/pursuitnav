// Reads National Highways' live feed with the server's own parser and lists
// the carriageway closures in the region it would avoid now. Run by the
// "National Highways sample" workflow; needs NATIONAL_HIGHWAYS_KEY.
import { HighwaysFeed } from "../src/highwaysClosures.js";

const key = process.env.NATIONAL_HIGHWAYS_KEY;
if (!key) {
  console.log("No NATIONAL_HIGHWAYS_KEY.");
  process.exit(1);
}
const region: [number, number, number, number] = [-0.8, 50.8, 1.6, 52.2];
const feed = new HighwaysFeed(key, region, undefined, undefined, (s) => console.log("feed answered:", s));
await feed.refresh();
const now = feed.current();
console.log(`${now.length} carriageway closure(s) in force now in London, Kent and Essex:`);
for (const c of now) console.log(`- ${c.street || "(no description)"} · ${c.rings.length} box(es) · ${c.id}`);
