// "Paste the job": the operator pastes or types what the control room sent
// ("Male acting aggressively outside Flat 3, Smith House, 54 Caledonian Road
// N7 8LA, caller is the neighbour") and the app pulls out the address parts
// and offers them as searches, best first. Plain rules on the phone: no AI,
// nothing sent anywhere, works with no signal.

const ROAD = new Set([
  "road", "rd", "street", "st", "avenue", "ave", "lane", "ln", "way", "grove", "place", "pl", "terrace",
  "gardens", "gdns", "crescent", "close", "square", "sq", "parade", "row", "walk", "mews", "drive", "dr",
  "green", "rise", "hill", "park", "broadway", "embankment", "approach", "highway", "bridge",
]);
const BLOCK = new Set(["house", "court", "estate", "mansions", "tower", "point", "lodge", "buildings", "block", "heights"]);
// Words that end a name when reading backwards from "Road" or "House".
const STOP = new Set([
  "a", "an", "and", "at", "by", "for", "from", "in", "into", "near", "of", "off", "on", "onto", "opposite", "o/s",
  "outside", "the", "to", "towards", "with", "junction", "j/w", "jw", "flat", "floor", "is", "was", "caller", "male",
  "female", "address", "location", "loc", "rear", "front", "behind", "between", "corner", "top", "bottom", "end",
]);
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const FLAT = /\b(?:flat|apt|apartment|unit)\s*([0-9]+[a-z]?|[a-z][0-9]*)\b/i;
const NUMBER = /^\d+[a-z]?(?:-\d+[a-z]?)?$/i;

/** Words in a job's story ("outside", "near", "caller") that a typed address doesn't have. */
const NARRATIVE = new Set([...STOP].filter((w) => !["flat", "floor", "rear", "front", "top", "bottom", "end"].includes(w)));

/** Text that reads like a job (several lines, or a sentence about it), not a typed address. */
export function looksLikeJob(text: string): boolean {
  const t = text.trim();
  if (t.includes("\n")) return true;
  const words = t.toLowerCase().split(/[\s,]+/).filter(Boolean);
  return words.length >= 14 || (words.length >= 8 && words.some((w) => NARRATIVE.has(w)));
}

const title = (s: string) =>
  s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());

interface Named {
  name: string;
  number?: string;
}

/** Names ending in one of `ends` ("Caledonian Road", "Smith House"), with any number just before. */
function named(tokens: string[], ends: Set<string>): Named[] {
  const out: Named[] = [];
  tokens.forEach((tok, i) => {
    if (!ends.has(tok.toLowerCase()) || i === 0) return;
    const words: string[] = [];
    let j = i - 1;
    while (j >= 0 && words.length < 3 && /^[a-z'’]+$/i.test(tokens[j]!) && !STOP.has(tokens[j]!.toLowerCase())) {
      words.unshift(tokens[j]!);
      j--;
    }
    if (!words.length) return;
    const number = j >= 0 && NUMBER.test(tokens[j]!) ? tokens[j]!.toUpperCase() : undefined;
    out.push({ name: title(`${words.join(" ")} ${tok}`), number });
  });
  return out;
}

/** Searches to offer for a pasted job, best first (at most 5). */
export function jobSearches(text: string): string[] {
  const pc = POSTCODE.exec(text);
  const postcode = pc ? `${pc[1]!.toUpperCase()} ${pc[2]!.toUpperCase()}` : undefined;
  const flatMatch = FLAT.exec(text);
  const flat = flatMatch ? `Flat ${flatMatch[1]!.toUpperCase()}` : undefined;
  // Postcodes out of the way first, so "N7 8LA" isn't read as part of a name.
  const tokens = text.replace(POSTCODE, " ").split(/[\s,;:.()"\n]+/).filter(Boolean);
  const roads = named(tokens, ROAD);
  const blocks = named(tokens, BLOCK).map((b) => b.name);
  const road = roads.find((r) => r.number) ?? roads[0];
  const street = road ? (road.number ? `${road.number} ${road.name}` : road.name) : undefined;

  const all = [
    [flat, blocks[0], street, postcode].filter(Boolean).join(", "),
    street && postcode ? `${street}, ${postcode}` : "",
    street ?? "",
    postcode ?? "",
    blocks[0] && road ? `${blocks[0]}, ${road.name}` : "",
    ...blocks,
    ...roads.map((r) => r.name),
  ];
  const seen = new Set<string>();
  return all
    .map((s) => s.trim())
    .filter((s) => s && !/^Flat \w+$/.test(s) && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, 5);
}
