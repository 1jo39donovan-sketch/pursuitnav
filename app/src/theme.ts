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

export const fonts = {
  displayMedium: "BarlowCondensed_500Medium",
  displaySemiBold: "BarlowCondensed_600SemiBold",
  displayBold: "BarlowCondensed_700Bold",
  body: "IBMPlexSans_400Regular",
  bodyMedium: "IBMPlexSans_500Medium",
  bodySemiBold: "IBMPlexSans_600SemiBold",
  mono: "IBMPlexMono_500Medium",
} as const;
