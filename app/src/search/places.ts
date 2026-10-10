// Named places from OpenStreetMap (shops, cafés, schools, parks, blocks…),
// built weekly on the server by server/places/extract_places.py.
import { BOROUGHS, type Borough } from "./boroughs";
import { normalise } from "./text";

export type PlaceGroup =
  | "food"
  | "shop"
  | "education"
  | "health"
  | "emergency"
  | "transport"
  | "leisure"
  | "worship"
  | "stay"
  | "culture"
  | "services"
  | "housing"
  | "area"
  | "other";

export interface PointOfInterest {
  name: string;
  /** alt_name, old_name, brand… */
  otherNames: string[];
  /** "Coffee shop", "Corner shop", "School"… */
  type: string;
  group: PlaceGroup;
  borough: Borough;
  lat: number;
  lng: number;
  /** "12 Holloway Road, N7 8LA" when OSM has it, else "". */
  address: string;
}

export interface PlacesFile {
  /** Date the server built it, e.g. "2026-10-09". */
  builtOn: string;
  places: PointOfInterest[];
}

const GROUPS = new Set<string>([
  "food", "shop", "education", "health", "emergency", "transport", "leisure",
  "worship", "stay", "culture", "services", "housing", "area", "other",
]);

export function parsePlacesFile(text: string): PlacesFile {
  const lines = text.split("\n");
  const header = lines[0]?.match(/^#blueroute-places v1 (\S+)/);
  if (!header) throw new Error("Not a Blue Route places file");
  const places: PointOfInterest[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const [name, other, type, group, b, lat, lng, address] = line.split("|");
    const borough = BOROUGHS[Number(b)];
    if (!name || !type || !borough) continue;
    places.push({
      name,
      otherNames: other ? other.split(";") : [],
      type,
      group: (GROUPS.has(group!) ? group : "other") as PlaceGroup,
      borough,
      lat: Number(lat) / 1e5,
      lng: Number(lng) / 1e5,
      address: address ?? "",
    });
  }
  return { builtOn: header[1]!, places };
}

/** Words officers might type to list a kind of place, beyond the type names themselves. */
const SYNONYMS: Record<string, string[]> = {
  cafe: ["Coffee shop"],
  coffee: ["Coffee shop"],
  "coffee shop": ["Coffee shop"],
  "corner shop": ["Corner shop"],
  convenience: ["Corner shop"],
  "off licence": ["Off-licence", "Corner shop"],
  offie: ["Off-licence", "Corner shop"],
  "chicken shop": ["Takeaway"],
  "fast food": ["Takeaway"],
  shop: ["Corner shop", "Supermarket"],
  gp: ["GP surgery"],
  doctor: ["GP surgery"],
  surgery: ["GP surgery"],
  "a&e": ["Hospital"],
  "police": ["Police station"],
  nick: ["Police station"],
  church: ["Place of worship"],
  mosque: ["Place of worship"],
  synagogue: ["Place of worship"],
  temple: ["Place of worship"],
  gurdwara: ["Place of worship"],
  tube: ["Station"],
  "train station": ["Station"],
  bookies: ["Bookmaker"],
  "betting shop": ["Bookmaker"],
  estate: ["Housing estate"],
  block: ["Block of flats"],
  flats: ["Block of flats"],
  nursery: ["Nursery"],
  gym: ["Gym"],
  garage: ["Garage", "Petrol station"],
  "petrol station": ["Petrol station"],
};

/** Singular forms to try: "coffee shops" → "coffee shop", "churches" → "church". */
function singulars(q: string): string[] {
  const out = [q];
  if (q.endsWith("ies")) out.push(q.slice(0, -3) + "y");
  if (q.endsWith("es")) out.push(q.slice(0, -2));
  if (q.endsWith("s")) out.push(q.slice(0, -1));
  return out;
}

/**
 * If the query names a kind of place ("coffee shops", "schools", "corner
 * shop"), the type labels it means. Empty if it doesn't.
 */
export function typesForQuery(query: string, knownTypes: ReadonlySet<string>): string[] {
  const q = normalise(query);
  if (q.length < 2) return [];
  const byNorm = new Map<string, string>();
  for (const t of knownTypes) byNorm.set(normalise(t), t);
  for (const form of singulars(q)) {
    const exact = byNorm.get(form);
    if (exact) return [exact];
    const syn = SYNONYMS[form];
    if (syn) return syn.filter((t) => knownTypes.has(t));
  }
  return [];
}
