// Leaving some of the base map's own place labels out, where the app draws
// the same place itself: a prison, police or fire station has a badge, a
// station its ring, and the base map's label beside it read as a second,
// different label (PM's desk test, 19 Nov: "HM Prison Pentonville" and
// "Caledonian Road & Barnsbury" near Caledonian Road).
import type { StyleSpecification } from "@maplibre/maplibre-react-native";

type Layer = StyleSpecification["layers"][number];
type Filter = unknown;

const COMPARISONS = new Set(["==", "!=", "<", "<=", ">", ">="]);

/** Whether a filter is an expression rather than the older form (MapLibre's own test). */
export function isExpressionFilter(filter: Filter): boolean {
  if (filter === true || filter === false) return true;
  if (!Array.isArray(filter) || filter.length === 0) return false;
  const [op] = filter as unknown[];
  if (COMPARISONS.has(op as string)) return filter.length !== 3 || Array.isArray(filter[1]) || Array.isArray(filter[2]);
  switch (op) {
    case "has":
      return filter.length >= 2 && filter[1] !== "$id" && filter[1] !== "$type";
    case "in":
      return filter.length >= 3 && (typeof filter[1] !== "string" || Array.isArray(filter[2]));
    case "!in":
    case "!has":
    case "none":
      return false;
    case "any":
    case "all":
      return filter.slice(1).every((f) => isExpressionFilter(f) || typeof f === "boolean");
    default:
      return true;
  }
}

/** The filter, also leaving out features whose `class` is one of these. */
export function withoutClasses(filter: Filter, classes: readonly string[]): Filter {
  // Already left out (the style is redrawn often): don't wrap it again.
  const json = JSON.stringify(filter ?? null);
  if (json.includes(JSON.stringify(["!in", "class", ...classes])) || json.includes(JSON.stringify([...classes]))) return filter;
  if (filter === undefined || filter === null) return ["!in", "class", ...classes];
  if (isExpressionFilter(filter)) return ["all", filter, ["match", ["get", "class"], [...classes], false, true]];
  return ["all", filter, ["!in", "class", ...classes]];
}

/** The style with the base map's `poi` labels of these classes left out. */
export function hideBaseLabels(style: StyleSpecification, classes: readonly string[]): StyleSpecification {
  const layers = style.layers.map((l) =>
    l.type === "symbol" && (l as { "source-layer"?: string })["source-layer"] === "poi"
      ? ({ ...l, filter: withoutClasses((l as { filter?: Filter }).filter, classes) } as Layer)
      : l,
  );
  return { ...style, layers };
}
