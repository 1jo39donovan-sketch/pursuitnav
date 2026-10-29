// Directions as a person would say them, not as the screen shows them: the
// routing engine writes "Turn left onto A3/Clapham Road.", which a voice reads
// as "A3 slash Clapham Road". Pure, so it can be tested.

/** A road number: A3, B221, M25, A40(M). */
const REF = String.raw`[ABM]\d{1,4}(?:\(M\))?`;

/**
 * London names a phone's voice often says wrongly, spelt as they sound (a
 * British voice already gets most, like Clapham, right). Whole
 * words only, so "Southwark Bridge Road" becomes "Suthuck Bridge Road".
 */
const SAY_AS: Record<string, string> = {
  Southwark: "Suthuck",
  Marylebone: "Marli-bun",
  Holborn: "Hoe-bun",
  Grosvenor: "Grove-ner",
  Theobalds: "Tibbalds",
  Greenwich: "Grennitch",
  Woolwich: "Woollitch",
  Dulwich: "Dullitch",
  Chiswick: "Chizzick",
  Leicester: "Lester",
  Gloucester: "Gloster",
  Plaistow: "Plarstow",
  Beauchamp: "Beecham",
  Ruislip: "Rye-slip",
  Streatham: "Stret-um",
  Fulham: "Fullum",
};

/** "A40(M)" read as "A40 motorway", and a bare number on a road as "the A3". */
function roadNumbers(s: string): string {
  return s
    .replace(new RegExp(String.raw`\b(onto|on|take|for|to|towards|toward|join|along) (${REF})\b`, "g"), "$1 the $2")
    .replace(/\(M\)/g, " motorway");
}

/**
 * What the voice says for an instruction. Drops the road number where the
 * road has a name ("A3/Clapham Road" → "Clapham Road"), the trailing
 * "Continue on A501.", and any slash; London names said properly.
 */
export function speakable(text: string): string {
  let s = text
    .replace(new RegExp(String.raw`\b${REF}/`, "g"), "")
    .replace(new RegExp(String.raw`/${REF}\b`, "g"), "")
    .replace(/\s+Continue (on|for|along)\b[^.]*\.?\s*$/i, "")
    .replace(/\s*\/\s*/g, " and ");
  return pronounced(roadNumbers(s))
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** London names spelt as they're said, for whatever the voice reads. */
export function pronounced(text: string): string {
  let s = text;
  for (const [word, said] of Object.entries(SAY_AS)) s = s.replace(new RegExp(`\\b${word}\\b`, "g"), said);
  return s;
}

/** The road's name if it has one, else its number ("Clapham Road", "the A3"). */
export function spokenRoad(streetNames: readonly string[]): string | null {
  const parts = streetNames.flatMap((n) => n.split("/").map((p) => p.trim())).filter(Boolean);
  const ref = new RegExp(`^${REF}$`);
  const name = parts.find((p) => !ref.test(p));
  if (name) return name;
  return parts[0] ? `the ${parts[0]}` : null;
}

/**
 * The first thing said on a route, instead of "Drive northeast on A3.":
 * "Head along Clapham Road." (towards an area, when one is known).
 */
export function startPrompt(streetNames: readonly string[], fallback: string, towards?: string | null): string {
  const road = spokenRoad(streetNames);
  if (!road) return speakable(fallback);
  return speakable(`Head along ${road}${towards ? ` towards ${towards}` : ""}.`);
}
