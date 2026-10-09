// Offline address search over bundled OS Open Names roads, ONS postcodes,
// a starter list of estates and the officer's own saved places.

import type { Borough } from "./boroughs";
import { formatPostcode, parseQuery } from "./parse";
import { matchScore, normalise } from "./text";

export interface Road {
  name: string;
  borough: Borough;
  /** Postcode districts the road runs through, e.g. ["N1", "N7"]. */
  outcodes: string[];
  lat: number;
  lng: number;
}

export interface PostcodePoint {
  postcode: string;
  borough: Borough;
  lat: number;
  lng: number;
}

/** A named block or estate, located by the road it's on. */
export interface Place {
  id?: number;
  name: string;
  road: string;
  borough: Borough;
  lat: number;
  lng: number;
  kind: "estate" | "saved";
}

export type ResultKind = "road" | "postcode" | "estate" | "saved" | "address";

export interface SearchResult {
  key: string;
  /** What the officer sees and what gets logged, e.g. "Flat 3, 54 Caledonian Road". */
  label: string;
  /** Second line, e.g. "Islington · N1 N7". */
  detail: string;
  borough: Borough;
  lat: number;
  lng: number;
  kind: ResultKind;
  /**
   * How exact the point is. A road from Open Names is one point somewhere
   * along it, so a house number on a long road may be some way off.
   */
  precision: "door" | "postcode" | "road";
  score: number;
}

export interface SearchResults {
  inArea: SearchResult[];
  outside: SearchResult[];
}

interface Indexed<T> {
  item: T;
  norm: string;
}

const MAX_RESULTS = 30;
// "N7" means "show me the roads in N7", so list them all.
const MAX_OUTWARD_RESULTS = 1000;

/** The parts of the query that aren't the road or place itself. */
interface Prefix {
  flat?: string;
  number?: string;
  extra?: string[];
}

/** "Flat 3", ["Smith House"], "54", "Holloway Road" → "Flat 3, Smith House, 54 Holloway Road". */
function labelFor({ flat, number, extra = [] }: Prefix, name: string): string {
  return [flat, ...extra, number ? `${number} ${name}` : name].filter(Boolean).join(", ");
}

const distanceKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

export class SearchIndex {
  private roads: Indexed<Road>[];
  private places: Indexed<Place>[] = [];
  private postcodes: Map<string, PostcodePoint>;

  constructor(roads: Road[], postcodes: PostcodePoint[], places: Place[] = []) {
    this.roads = roads.map((item) => ({ item, norm: normalise(item.name) }));
    this.postcodes = new Map(postcodes.map((p) => [p.postcode.replace(/\s/g, ""), p]));
    this.setPlaces(places);
  }

  /** Replace the estates and saved places (call after the officer adds one). */
  setPlaces(places: Place[]) {
    this.places = places.map((item) => ({ item, norm: normalise(item.name) }));
  }

  /** The bundled point for a road in a borough, for anchoring estates and saved places. */
  findRoad(name: string, borough: Borough): Road | undefined {
    return this.roads.find((r) => r.item.name === name && r.item.borough === borough)?.item;
  }

  /** Road names in the given boroughs, for picking the road a new place is on. */
  roadsIn(boroughs: ReadonlySet<Borough>): Road[] {
    return this.roads.filter((r) => boroughs.has(r.item.borough)).map((r) => r.item);
  }

  postcode(compact: string): PostcodePoint | undefined {
    return this.postcodes.get(compact.replace(/\s/g, "").toUpperCase());
  }

  search(raw: string, area: ReadonlySet<Borough>): SearchResults {
    if (raw.trim().length < 2) return { inArea: [], outside: [] };
    const hits = this.collect(raw);
    const limit = parseQuery(raw).outwardCode ? MAX_OUTWARD_RESULTS : MAX_RESULTS;

    const seen = new Set<string>();
    const unique = hits
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .filter((h) => {
        const k = `${h.label}|${h.borough}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

    return {
      inArea: unique.filter((h) => area.has(h.borough)).slice(0, limit),
      outside: unique.filter((h) => !area.has(h.borough)),
    };
  }

  private collect(raw: string): SearchResult[] {
    const q = parseQuery(raw);

    if (q.fullPostcode) {
      const p = this.postcodes.get(q.fullPostcode);
      if (!p) return [];
      return [
        {
          key: `pc:${p.postcode}`,
          label: p.postcode,
          detail: p.borough,
          borough: p.borough,
          lat: p.lat,
          lng: p.lng,
          kind: "postcode",
          precision: "postcode",
          score: 100,
        },
      ];
    }

    if (q.outwardCode) {
      const code = q.outwardCode;
      return this.roads
        .filter((r) => r.item.outcodes.includes(code))
        .map((r) => this.roadResult(r.item, {}, 80));
    }

    // Try each comma-separated part as the road or place; the best-matching
    // part is it, and the others become part of the label ("Smith House, ").
    let best: [Road | Place, number][] = [];
    let bestPart = -1;
    let bestTop = 0;
    q.parts.forEach((part, i) => {
      const norm = normalise(part);
      if (norm.length < 2) return;
      const scored: [Road | Place, number][] = [];
      for (const p of this.places) {
        const s = matchScore(p.norm, norm);
        if (s) scored.push([p.item, s + 2]); // a named place beats a road of the same name
      }
      for (const r of this.roads) {
        const s = matchScore(r.norm, norm);
        if (s) scored.push([r.item, s]);
      }
      const top = scored.reduce((m, [, s]) => Math.max(m, s), 0);
      if (top > bestTop) {
        bestTop = top;
        best = scored;
        bestPart = i;
      }
    });

    const prefix: Prefix = { flat: q.flat, number: q.number, extra: q.parts.filter((_, i) => i !== bestPart) };
    const hits = best.map(([item, score]) =>
      "kind" in item ? this.placeResult(item, prefix, score) : this.roadResult(item, prefix, score),
    );

    // A postcode on the end pins the right one of several same-named roads,
    // and gives a closer point than the road's own.
    if (q.postcode) {
      const p = this.postcodes.get(q.postcode.replace(/\s/g, ""));
      if (p) {
        for (const h of hits) {
          if (h.borough === p.borough && distanceKm(h, p) < 1.5) {
            h.score += 15;
            h.lat = p.lat;
            h.lng = p.lng;
            h.precision = "postcode";
            h.detail += ` · ${formatPostcode(q.postcode)}`;
          }
        }
      }
    }
    return hits;
  }

  private roadResult(r: Road, prefix: Prefix, score: number): SearchResult {
    const label = labelFor(prefix, r.name);
    return {
      key: `road:${r.name}|${r.borough}|${label}`,
      label,
      detail: `${r.borough} · ${r.outcodes.join(" ")}`,
      borough: r.borough,
      lat: r.lat,
      lng: r.lng,
      kind: "road",
      precision: "road",
      score,
    };
  }

  private placeResult(p: Place, prefix: Prefix, score: number): SearchResult {
    const label = labelFor(prefix, p.name);
    return {
      key: `${p.kind}:${p.id ?? p.name}|${p.borough}|${label}`,
      label,
      detail: `${p.borough} · off ${p.road}`,
      borough: p.borough,
      lat: p.lat,
      lng: p.lng,
      kind: p.kind,
      precision: "road",
      score,
    };
  }
}
