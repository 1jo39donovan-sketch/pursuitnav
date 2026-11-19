// The weekly transport-lines file (server/places/extract_lines.py) read as
// GeoJSON. Pure, so it can be tested.

export interface TransportLines {
  /** The build's date, for knowing when the map needs remaking. */
  version: string;
  geojson: GeoJSON.FeatureCollection;
}

/** The lines file as GeoJSON: one LineString per stretch, with name, colour, mode and tunnel. */
export function parseLines(text: string): TransportLines | null {
  const rows = text.split("\n");
  const header = rows[0] ?? "";
  if (!header.startsWith("#blueroute-lines v1")) return null;
  const features: GeoJSON.Feature[] = [];
  for (const row of rows.slice(1)) {
    const [name, colour, mode, tunnel, coords] = row.split("|");
    if (!name || !coords || !/^#[0-9a-f]{6}$/i.test(colour ?? "")) continue;
    const points = coords.split(" ").map((p) => {
      const [x, y] = p.split(",");
      return [Number(x) / 1e5, Number(y) / 1e5];
    });
    if (points.length < 2 || points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) continue;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: points },
      properties: { name, colour, mode, tunnel: tunnel === "1" },
    });
  }
  return { version: header.split(" ")[2] ?? "", geojson: { type: "FeatureCollection", features } };
}
