// Splits what the control room gave into its parts:
//   "Flat 3, 54 Caledonian Rd, N7 8LA" → flat 3, number 54, "Caledonian Rd", postcode N7 8LA

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
const OUTWARD_CODE = /^[A-Z]{1,2}\d[A-Z\d]?$/;

export interface ParsedQuery {
  /** "Flat 3" etc., tidied. */
  flat?: string;
  /** House number or range: "54", "54A", "54-56". */
  number?: string;
  /** Remaining comma-separated parts, e.g. ["Smith House", "Holloway Road"]. */
  parts: string[];
  /** Postcode at the end of a longer address, e.g. "N7 8LA". */
  postcode?: string;
  /** The whole query is a postcode: "N78LA". */
  fullPostcode?: string;
  /** The whole query is an outward code: "N7". */
  outwardCode?: string;
}

/** "n78la" → "N7 8LA". */
export function formatPostcode(compact: string): string {
  const c = compact.replace(/\s/g, "").toUpperCase();
  return `${c.slice(0, -3)} ${c.slice(-3)}`;
}

export function parseQuery(raw: string): ParsedQuery {
  let q = raw.trim();
  const compact = q.replace(/\s/g, "").toUpperCase();
  if (FULL_POSTCODE.test(compact)) return { parts: [], fullPostcode: compact };
  if (OUTWARD_CODE.test(compact)) return { parts: [], outwardCode: compact };

  const out: ParsedQuery = { parts: [] };
  const flat = q.match(/^(flat|apt|apartment|unit|room)\s*([\w-]+)\s*,?\s*/i);
  if (flat) {
    out.flat = `Flat ${flat[2]!.toUpperCase()}`;
    q = q.slice(flat[0].length);
  }
  const num = q.match(/^(\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?)\s*,?\s+/i);
  if (num) {
    out.number = num[1]!.replace(/\s/g, "").replace("–", "-").toUpperCase();
    q = q.slice(num[0].length);
  }
  const pc = q.match(/,?\s*([a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2})\s*$/i);
  if (pc && q.length > pc[0].length) {
    out.postcode = formatPostcode(pc[1]!);
    q = q.slice(0, q.length - pc[0].length);
  }
  out.parts = q
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return out;
}
