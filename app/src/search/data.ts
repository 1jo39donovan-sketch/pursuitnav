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

export function parsePostcodes(text: string): PostcodePoint[] {
  const out: PostcodePoint[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const [postcode, b, lat, lng] = line.split("|");
    out.push({ postcode: postcode!, borough: borough(b!), lat: Number(lat) / 1e5, lng: Number(lng) / 1e5 });
  }
  return out;
}
