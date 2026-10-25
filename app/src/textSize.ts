// Larger text (Session), for an operator reading on the move: the screens
// used on the way to a call (Search, the route choice, navigation) take
// their styles through useTextStyles. Big text grows less, so it still fits.
import { useSession } from "./session/SessionProvider";

const SMALL_GROWS = 1.25;
const BIG_GROWS = 1.1;
const BIG = 30;

type Styles = Record<string, object>;
const made = new WeakMap<object, object>();

/** The styles with every fontSize and lineHeight made larger. */
export function enlarge<T extends Styles>(styles: T): T {
  const hit = made.get(styles);
  if (hit) return hit as T;
  const out: Styles = {};
  for (const [k, v] of Object.entries(styles)) {
    const s = v as { fontSize?: unknown; lineHeight?: unknown };
    if (typeof s.fontSize !== "number") {
      out[k] = v;
      continue;
    }
    const f = s.fontSize >= BIG ? BIG_GROWS : SMALL_GROWS;
    out[k] = {
      ...v,
      fontSize: Math.round(s.fontSize * f),
      ...(typeof s.lineHeight === "number" ? { lineHeight: Math.round(s.lineHeight * f) } : {}),
    };
  }
  made.set(styles, out);
  return out as T;
}

/** A screen's styles, larger when Session's "Larger text" is on. */
export function useTextStyles<T extends Styles>(styles: T): T {
  return useSession().largeText ? enlarge(styles) : styles;
}
