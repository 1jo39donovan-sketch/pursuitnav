// Splits what the control room gave into its parts, so each provider is asked
// only what it can answer: "Flat 3, 54 Caledonian Rd, N7 8LA" → unit "Flat 3",
// number "54", street "Caledonian Rd", postcode "N7 8LA". OS Names can't find
// house numbers and guesses loosely at anything it's given (a stray "8LA"
// brings back every 8LA postcode in London); Nominatim misses an address
// whose postcode is wrong. The app does the same in app/src/search/parse.ts.

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
const OUTWARD_CODE = /^[A-Z]{1,2}\d[A-Z\d]?$/;
const SUB_UNIT = /^\s*((?:flat|unit|apartment|apt|room|suite|studio)\s+[\w-]+)\s*,?\s*/i;
const NUMBER = /^(\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?)\s*,?\s+/i;
// The number after the street, as some write it: "Smith Street 21", "Smith Street, 21a, N7".
const TRAILING_NUMBER = /^([^,]*[a-z][^,]*?)[\s,]+(\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?)(?=\s*(?:,|$))/i;
const TRAILING_POSTCODE = /,?\s*([a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2})\s*$/i;
const TRAILING_OUTWARD = /,\s*([a-z]{1,2}\d[a-z\d]?)\s*$/i;

export interface AddressQuery {
  /** "Flat 3", kept for the label. */
  unit?: string;
  /** House number, lower case: "53", "53a". */
  number?: string;
  /** The street or place, with no unit, number or postcode: "Caledonian Road". */
  text: string;
  /** A full postcode, alone or at the end: "N7 8LA". */
  postcode?: string;
  /** An outward code at the end ("…, N7") or alone ("N7"). */
  outward?: string;
}

/** "n78la" → "N7 8LA". */
export function formatPostcode(raw: string): string {
  const c = raw.replace(/\s/g, "").toUpperCase();
  return `${c.slice(0, -3)} ${c.slice(-3)}`;
}

export function parseAddressQuery(raw: string): AddressQuery {
  let q = raw.trim();
  const compact = q.replace(/\s/g, "").toUpperCase();
  if (FULL_POSTCODE.test(compact)) return { text: "", postcode: formatPostcode(compact) };
  if (OUTWARD_CODE.test(compact)) return { text: "", outward: compact };

  const out: AddressQuery = { text: "" };
  const unit = SUB_UNIT.exec(q);
  if (unit) {
    out.unit = unit[1]!.replace(/\s+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    q = q.slice(unit[0].length);
  }
  const num = NUMBER.exec(q);
  if (num) {
    out.number = num[1]!.replace(/\s/g, "").replace("–", "-").toLowerCase();
    q = q.slice(num[0].length);
  }
  const pc = TRAILING_POSTCODE.exec(q);
  if (pc && q.length > pc[0].length) {
    out.postcode = formatPostcode(pc[1]!);
    q = q.slice(0, q.length - pc[0].length);
  } else {
    const ow = TRAILING_OUTWARD.exec(q);
    if (ow && q.length > ow[0].length) {
      out.outward = ow[1]!.toUpperCase();
      q = q.slice(0, q.length - ow[0].length);
    }
  }
  const after = out.number ? null : TRAILING_NUMBER.exec(q);
  if (after) {
    out.number = after[2]!.replace(/\s/g, "").replace("–", "-").toLowerCase();
    q = after[1]! + q.slice(after[0].length);
  }
  out.text = q
    .replace(/\s+/g, " ")
    .replace(/[,\s]+$/, "")
    .trim();
  return out;
}
