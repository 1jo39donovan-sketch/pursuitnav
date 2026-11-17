// Police stations (custody suites marked), fire and ambulance stations, A&E,
// courts and prisons on every map: where a crew takes someone, meets up or
// gets sent from, and landmarks they all know. A letter badge each, the name
// beside it closer in. From the places file on the phone, so offline too.
import type { StyleSpecification } from "@maplibre/maplibre-react-native";

import { CUSTODY_SUITES, custodyStation, type CustodySuite } from "../area/custody";
import { regionOf, type Borough } from "../search/boroughs";
import { ambulanceSite, fireSite, policeSite, type ServiceSite } from "../area/serviceSites";
import type { PointOfInterest } from "../search/places";
import type { MapTheme } from "../session/SessionProvider";

type Layer = StyleSpecification["layers"][number];

export type ServiceKind = "police" | "custody" | "fire" | "ambulance" | "ae" | "court" | "prison";

const KIND_OF_TYPE: Record<string, ServiceKind> = {
  "Police station": "police",
  "Fire station": "fire",
  "Ambulance station": "ambulance",
  "Hospital with A&E": "ae",
  Court: "court",
  Prison: "prison",
};

export const SERVICE_STYLE: Record<ServiceKind, { letter: string; colour: string }> = {
  police: { letter: "P", colour: "#1d4ed8" },
  custody: { letter: "C", colour: "#1d4ed8" },
  fire: { letter: "F", colour: "#dc2626" },
  ambulance: { letter: "A", colour: "#15803d" },
  ae: { letter: "A&E", colour: "#dc2626" },
  court: { letter: "Ct", colour: "#57534e" },
  prison: { letter: "Pr", colour: "#57534e" },
};

export const SERVICES_SOURCE = "br-services";
const SERVICES_PREFIX = "br-services-";
/** The badge layer, for finding which badge a tap was on. */
export const SERVICES_BADGE_LAYER = `${SERVICES_PREFIX}badge`;

const AGENCY_NAME: Record<CustodySuite["agency"], string> = {
  MPS: "Metropolitan Police",
  BTP: "British Transport Police",
  UKBF: "Border Force",
  Kent: "Kent Police",
  Essex: "Essex Police",
};

/** A fire or ambulance station's own kind (police have policeSite). */
function siteOf(p: PointOfInterest): ServiceSite {
  if (p.type === "Fire station") return fireSite(p.name);
  if (p.type === "Ambulance station") return ambulanceSite(p.name);
  return { site: "service" };
}

/** Who runs it, from its name and area (OSM rarely says). */
function operatorOf(kind: ServiceKind, name: string, borough: string): string | null {
  const other = kind === "fire" ? fireSite(name) : kind === "ambulance" ? ambulanceSite(name) : null;
  if (other?.site === "other") return other.operator;
  const region = regionOf(borough as Borough)?.id ?? "london";
  if (kind === "police" || kind === "custody") {
    if (/british transport police|\bbtp\b/i.test(name)) return "British Transport Police";
    if (borough === "City of London" || /city of london police/i.test(name)) return "City of London Police";
    return region === "kent" ? "Kent Police" : region === "essex" ? "Essex Police" : "Metropolitan Police";
  }
  if (kind === "fire")
    return region === "kent" ? "Kent Fire and Rescue Service" : region === "essex" ? "Essex County Fire and Rescue Service" : "London Fire Brigade";
  if (kind === "ambulance")
    return region === "kent"
      ? "South East Coast Ambulance Service"
      : region === "essex"
        ? "East of England Ambulance Service"
        : "London Ambulance Service";
  return null;
}

/** What a crew needs to know about it, for the card a tap on its badge opens. */
function describe(kind: ServiceKind, p: PointOfInterest, suite: CustodySuite | null): { type: string; notes: string } {
  const operator = operatorOf(kind, p.name, p.borough);
  const btp = operator === "British Transport Police";
  const lines: string[] = [];
  if (operator) lines.push(operator);
  if (btp) lines.push("Railway police: the rail, Tube, DLR and tram network.");
  if (suite) {
    lines.push(
      suite.kind === "24/7"
        ? `24/7 custody suite (${AGENCY_NAME[suite.agency]})`
        : `Contingency custody suite (${AGENCY_NAME[suite.agency]}): opened when others are full`,
    );
  } else if (kind === "police") {
    if (policeSite(p.name) === "base") lines.push("Police base: no public front counter.");
    lines.push("No custody suite here.");
  }
  if (kind === "ae") lines.push("Emergency department (A&E).");
  if (kind === "court") {
    if (/crown/i.test(p.name)) lines.push("Crown Court");
    else if (/magistrates/i.test(p.name)) lines.push("Magistrates' court");
  }
  const type =
    kind === "custody" || kind === "police"
      ? `${btp ? "BTP station" : !suite && policeSite(p.name) === "base" ? "Police base" : "Police station"}${suite ? " · custody" : ""}`
      : SERVICE_LABEL[kind];
  return { type, notes: lines.join("\n") };
}

const SERVICE_LABEL: Record<ServiceKind, string> = {
  police: "Police station",
  custody: "Police station · custody",
  fire: "Fire station",
  ambulance: "Ambulance station",
  ae: "Hospital with A&E",
  court: "Court",
  prison: "Prison",
};

/** The place types drawn as services. */
export const SERVICE_TYPES: ReadonlySet<string> = new Set(Object.keys(KIND_OF_TYPE));
/**
 * Also read, to find A&E: OSM often marks a hospital's A&E entrance but not
 * the hospital (the Whittington, 17 Nov 2026). A hospital with one within
 * AE_ENTRANCE_M counts as A&E; the entrances aren't drawn themselves.
 */
export const SERVICE_SOURCE_TYPES: ReadonlySet<string> = new Set([...SERVICE_TYPES, "Hospital", "A&E entrance"]);
const AE_ENTRANCE_M = 400;

const metresApart = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

/** Which place a badge is: its name and point, to leave it out of other markers. */
export function badgeKey(name: unknown, geometry: GeoJSON.Geometry): string {
  const [lng, lat] = geometry.type === "Point" ? geometry.coordinates : [NaN, NaN];
  return `${String(name)}|${lng?.toFixed(5)}|${lat?.toFixed(5)}`;
}

/** The services among the places, as GeoJSON points with their kind; custody suites' stations as custody. */
export function servicePoints(pois: readonly PointOfInterest[]): GeoJSON.FeatureCollection {
  const entrances = pois.filter((p) => p.type === "A&E entrance");
  const hasAe = (p: PointOfInterest) => entrances.some((e) => metresApart(e, p) <= AE_ENTRANCE_M);
  const services = pois
    .filter((p) => KIND_OF_TYPE[p.type] || (p.type === "Hospital" && hasAe(p)))
    // A former station, another agency or an office isn't somewhere to send anyone.
    .filter((p) => p.type !== "Police station" || policeSite(p.name) !== "not-police")
    .filter((p) => siteOf(p).site !== "none")
    .map((p) => (p.type === "Hospital" ? { ...p, type: "Hospital with A&E" } : p));
  const suiteOf = new Map<PointOfInterest, CustodySuite>();
  for (const suite of CUSTODY_SUITES) {
    const station = custodyStation(suite, services);
    if (station && !suiteOf.has(station)) suiteOf.set(station, suite);
  }
  return {
    type: "FeatureCollection",
    features: services.map((p) => {
      const suite = suiteOf.get(p) ?? null;
      const kind: ServiceKind = suite ? "custody" : KIND_OF_TYPE[p.type]!;
      const { type, notes } = describe(kind, p, suite);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          name: p.name,
          kind,
          letter: SERVICE_STYLE[kind].letter,
          colour: SERVICE_STYLE[kind].colour,
          // As a place marker's, so a tap opens the same card, with more to say.
          type,
          address: p.address,
          borough: p.borough,
          color: SERVICE_STYLE[kind].colour,
          notes,
        },
      };
    }),
  };
}

/** The font the style already labels with, bold, so the glyphs are there offline too. */
function boldFont(style: StyleSpecification): string[] {
  for (const l of style.layers) {
    const f = (l.layout as { "text-font"?: unknown } | undefined)?.["text-font"];
    if (Array.isArray(f) && f.every((x) => typeof x === "string")) {
      return f.some((x: string) => /Bold/.test(x)) ? f : f.map((x: string) => x.replace(/Regular|Italic/, "Bold"));
    }
  }
  return ["Noto Sans Bold"];
}

/** The style with the services drawn on top (above transport), or as it was without any. */
export function withServices(
  style: StyleSpecification,
  theme: MapTheme,
  points: GeoJSON.FeatureCollection | null | undefined,
): StyleSpecification {
  const kept = style.layers.filter((l) => !l.id.startsWith(SERVICES_PREFIX));
  if (!points || points.features.length === 0) return { ...style, layers: kept };
  const night = theme === "night";
  const font = boldFont(style);
  const layers: Layer[] = [
    {
      id: SERVICES_BADGE_LAYER,
      type: "circle",
      source: SERVICES_SOURCE,
      minzoom: 11,
      paint: {
        "circle-color": ["get", "colour"] as never,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5, 14, 10, 17, 13] as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    },
    {
      id: `${SERVICES_PREFIX}letter`,
      type: "symbol",
      source: SERVICES_SOURCE,
      minzoom: 13,
      layout: {
        "text-field": ["get", "letter"] as never,
        "text-font": font,
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9, 17, 12] as never,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": "#ffffff" },
    },
    {
      id: `${SERVICES_PREFIX}label`,
      type: "symbol",
      source: SERVICES_SOURCE,
      minzoom: 14,
      layout: {
        "text-field": ["get", "name"] as never,
        "text-font": font,
        "text-size": 13,
        "text-anchor": "left",
        "text-offset": [1.2, 0],
        "text-max-width": 10,
        "text-optional": true,
      },
      paint: {
        "text-color": night ? "#f1f4fa" : "#111111",
        "text-halo-color": night ? "#0b1019" : "#ffffff",
        "text-halo-width": 2,
      },
    },
  ];
  // Over transport's stations, under nothing else of ours.
  return {
    ...style,
    sources: { ...style.sources, [SERVICES_SOURCE]: { type: "geojson", data: points } },
    layers: [...kept, ...layers],
  };
}
