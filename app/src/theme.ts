// Colours and type taken from the clickable prototype: dark navy for night
// shifts, amber for the thing that needs attention. A light version for
// daylight, used when the phone is set to light (or chosen on Session).
//
// Styles are written with the dark colours; useThemed (and useTextStyles)
// swap them for the light ones. Colours used outside a stylesheet come from
// useColors().
export const colors = {
  bg: "#0c1220",
  panel: "#141c2e",
  line: "#26324a",
  fg: "#e7ecf5",
  muted: "#8c98b0",
  amber: "#ffb627",
  blue: "#3d8bff",
  ok: "#3ccf8e",
  warn: "#ff5a4f",
} as const;

export type Palette = { [K in keyof typeof colors]: string };

/** The same roles in daylight: darker amber, blue and green so they read on white. */
export const lightColors: Palette = {
  bg: "#f3f5f9",
  panel: "#ffffff",
  line: "#cfd6e2",
  fg: "#0c1220",
  muted: "#55617a",
  amber: "#a35f00",
  blue: "#1f63d6",
  ok: "#11804f",
  warn: "#d0342c",
};

/** "system" follows the phone's dark or light setting. */
export type Appearance = "system" | "dark" | "light";
export const APPEARANCES: Appearance[] = ["system", "dark", "light"];

const toLight = new Map<string, string>([
  ...(Object.keys(colors) as (keyof typeof colors)[]).map((k) => [colors[k].toLowerCase(), lightColors[k]] as const),
  // Shades used here and there, beside the palette.
  ["#1a1200", "#ffffff"], // text on an amber button: white on the darker amber
  ["#2a1d0a", "#fff1d6"], // the amber-tinted turn card
  ["#93c5fd", "#1d4ed8"], // pale blue text
  ["#60a5fa", "#1f63d6"],
  ["#ff8a8d", "#c62828"], // pale red text
]);

/** A dark-palette colour as it is in daylight (other colours unchanged). */
export function lightOf<T>(value: T): T {
  return typeof value === "string" ? ((toLight.get(value.toLowerCase()) ?? value) as T) : value;
}

type Styles = Record<string, object>;
const lit = new WeakMap<object, object>();

/** The styles with every palette colour swapped for its daylight version. */
export function lighten<T extends Styles>(styles: T): T {
  const hit = lit.get(styles);
  if (hit) return hit as T;
  const out: Styles = {};
  for (const [k, v] of Object.entries(styles)) {
    const style: Record<string, unknown> = {};
    for (const [prop, value] of Object.entries(v)) style[prop] = /color$/i.test(prop) ? lightOf(value) : value;
    out[k] = style;
  }
  lit.set(styles, out);
  return out as T;
}

// Inter throughout: clear and calm at a glance, as in Google Maps. The
// display names are for big numbers and headings, the body ones for text.
export const fonts = {
  displayMedium: "Inter_500Medium",
  displaySemiBold: "Inter_600SemiBold",
  displayBold: "Inter_700Bold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
  mono: "Inter_500Medium",
} as const;
