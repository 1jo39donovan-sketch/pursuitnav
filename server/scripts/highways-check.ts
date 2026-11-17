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
// Now, and later tonight (most motorway closures are overnight).
for (const hours of [0, 3, 6]) {
  const at = new Date(Date.now() + hours * 3600_000);
  await feed.refresh(at);
  const list = feed.current(at);
  console.log(`${list.length} carriageway closure(s) in force at ${at.toISOString().slice(0, 16)}Z in London, Kent and Essex:`);
  for (const c of list.slice(0, 25)) console.log(`- ${c.street || "(no description)"} · ${c.rings.length} box(es) · ${c.id}`);
}
