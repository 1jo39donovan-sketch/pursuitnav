// What crews and the control room call places, for searching: "Cally Road"
// finds Caledonian Road. Each is a whole word or phrase, any case, and the
// search looks up both what was typed and the spelt-out name, so a place
// actually called "Cally" (Cally Pool) is still found.
//
// London's for now. To add one: the nickname in lower case, then what it
// stands for. Keep them unambiguous: "the grove" or "the bush" could be
// several places, so they're left out.
export const NICKNAMES: readonly (readonly [string, string])[] = [
  ["the cally", "Caledonian Road"],
  ["cally", "Caledonian"],
  ["ally pally", "Alexandra Palace"],
  ["the elephant", "Elephant and Castle"],
  ["elephant", "Elephant and Castle"],
  ["kings x", "Kings Cross"],
  ["kx", "Kings Cross"],
  ["tcr", "Tottenham Court Road"],
  ["shep bush", "Shepherds Bush"],
  ["stokey", "Stoke Newington"],
  ["the angel", "Angel"],
  ["the city", "City of London"],
  ["the strand", "Strand"],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The query with nicknames spelt out, or null when it has none. The first
 * match wins for each part of the query, longer nicknames first.
 */
export function expandNicknames(query: string): string | null {
  let out = query;
  for (const [nick, full] of [...NICKNAMES].sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`(^|[^a-z0-9])${escape(nick)}(?=$|[^a-z0-9])`, "i");
    // Don't expand what's already spelt out ("Elephant and Castle").
    if (re.test(out) && !out.toLowerCase().includes(full.toLowerCase())) {
      out = out.replace(re, (_m, before: string) => `${before}${full}`);
    }
  }
  return out === query ? null : out;
}
