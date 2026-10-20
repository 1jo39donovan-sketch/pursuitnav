// Parses the bundled data files (see assets/data/README.md).
import { BOROUGHS, type Borough } from "./boroughs";
import type { PostcodePoint, Road } from "./engine";

const borough = (index: string): Borough => {
  const b = BOROUGHS[Number(index)];
  if (!b) throw new Error(`Unknown borough index ${index}`);
  return b;
};

export function parseRoads(text: string): Road[] {
  const out: Road[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const [name, b, outcodes, lat, lng] = line.split("|");
    out.push({
      name: name!,
      borough: borough(b!),
      outcodes: outcodes ? outcodes.split(" ") : [],
      lat: Number(lat) / 1e5,
      lng: Number(lng) / 1e5,
    });
  }
  return out;
}

/**
 * The server's named-roads file (server/places/extract_roads.py), from
 * OpenStreetMap: `name|borough|lat×1e5|lng×1e5` after a header line.
 * Outcodes aren't in it; SearchIndex.addRoads works them out.
 */
export function parseServerRoads(text: string): Road[] {
  const [header, ...lines] = text.split("\n");
  if (!header?.startsWith("#blueroute-roads v1")) throw new Error("Not a Blue Route roads file");
  const out: Road[] = [];
  for (const line of lines) {
    if (!line) continue;
    const [name, b, lat, lng] = line.split("|");
    if (!name || !b) continue;
    out.push({ name, borough: borough(b), outcodes: [], lat: Number(lat) / 1e5, lng: Number(lng) / 1e5 });
  }
  return out;
}

export function parsePostcodes(text: string): PostcodePoint[] {
  const out: PostcodePoint[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const [postcode, b, lat, lng] = line.split("|");
    out.push({ postcode: postcode!, borough: borough(b!), lat: Number(lat) / 1e5, lng: Number(lng) / 1e5 });
  }
  return out;
}
