// Text matching for addresses as typed from the control room.

const ABBREVIATIONS: Record<string, string> = {
  st: "street",
  rd: "road",
  ave: "avenue",
  av: "avenue",
  ln: "lane",
  gdns: "gardens",
  gdn: "gardens",
  est: "estate",
  sq: "square",
  cres: "crescent",
  pl: "place",
  ct: "court",
  gr: "grove",
  tce: "terrace",
  hse: "house",
  cl: "close",
  mws: "mews",
  wlk: "walk",
  pk: "park",
  hl: "hill",
  bldgs: "buildings",
  bdgs: "buildings",
  grn: "green",
  dr: "drive",
  hts: "heights",
};

/** Lower case, punctuation out, abbreviations spelt out: "St John's St" → "saint johns street". */
export function normalise(s: string): string {
  const words = s
    .toLowerCase()
    .replace(/[’'.]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  // "St" first is usually Saint (St John Street); later it's Street.
  return words
    .map((w, i) => (w === "st" && i === 0 && words.length > 1 ? "saint" : (ABBREVIATIONS[w] ?? w)))
    .join(" ");
}

/** Edit distance, giving up (returning max + 1) once it's over `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j]! < best) best = cur[j]!;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * How well a normalised name matches a normalised query, 0–100.
 * Exact beats prefix beats word match beats substring beats misspelling.
 */
export function matchScore(name: string, query: string): number {
  if (name === query) return 100;
  if (name.startsWith(query)) return 90;
  if (name.includes(" " + query)) return 80;
  if (name.includes(query)) return 65;
  // Misspellings: only for longer queries, and the first letter must be right.
  if (query.length < 4 || name[0] !== query[0]) return 0;
  const max = query.length <= 5 ? 1 : query.length <= 9 ? 2 : 3;
  const d = Math.min(editDistance(query, name, max), editDistance(query, name.slice(0, query.length), max));
  return d <= max ? 50 - d * 8 : 0;
}
