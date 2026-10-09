import type { PlaceGroup } from "./places";

export interface GroupInfo {
  key: PlaceGroup;
  label: string;
  /** Marker colour, chosen to stand apart on the navy map. */
  color: string;
}

// Order shown in the map's Places chooser. Areas aren't markers: they're
// whole neighbourhoods, not spots.
export const MARKER_GROUPS: GroupInfo[] = [
  { key: "emergency", label: "Emergency services", color: "#ff4d4d" },
  { key: "health", label: "Health", color: "#f472b6" },
  { key: "education", label: "Schools", color: "#7dd3fc" },
  { key: "transport", label: "Transport", color: "#a78bfa" },
  { key: "food", label: "Food and drink", color: "#ff9a3d" },
  { key: "shop", label: "Shops", color: "#ffd166" },
  { key: "leisure", label: "Parks and leisure", color: "#3ccf8e" },
  { key: "housing", label: "Blocks and estates", color: "#60a5fa" },
  { key: "worship", label: "Places of worship", color: "#d8b4fe" },
  { key: "stay", label: "Hotels", color: "#fda4af" },
  { key: "culture", label: "Culture", color: "#fcd34d" },
  { key: "services", label: "Services and offices", color: "#94a3b8" },
  { key: "other", label: "Other", color: "#64748b" },
];

export const GROUP_COLOR: Record<string, string> = Object.fromEntries(MARKER_GROUPS.map((g) => [g.key, g.color]));

/** Offered first time the Places chooser opens. */
export const DEFAULT_MARKER_GROUPS: PlaceGroup[] = ["emergency", "health", "education", "transport"];
