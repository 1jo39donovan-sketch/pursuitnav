// Colours and type taken from the clickable prototype: dark navy for night
// shifts, amber for the thing that needs attention.
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
