// Offline address search over bundled OS Open Names roads, ONS postcodes,
// a starter list of estates, the officer's own saved places, and named
// places from OpenStreetMap (shops, cafés, schools, parks, blocks…).

import type { Borough } from "./boroughs";
import { formatPostcode, parseQuery } from "./parse";
import { typesForQuery, type PlaceGroup, type PointOfInterest } from "./places";
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

export type ResultKind = "road" | "postcode" | "estate" | "saved" | "address" | "poi";

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
  precision: "door" | "postcode" | "road" | "place";
  score: number;
  /** For named places: their type, e.g. "Coffee shop", shown as the tag. */
  placeType?: string;
  placeGroup?: PlaceGroup;
}

export interface SearchResults {
  inArea: SearchResult[];
  outside: SearchResult[];
  /** How many matches are outside the area, when that's more than `outside` holds. */
  outsideCount?: number;
}

interface Indexed<T> {
  item: T;
  norm: string;
}

const MAX_RESULTS = 30;
// "N7" means "show me the roads in N7", and "coffee shops" every coffee
// shop in the area, so list them all.
const MAX_LIST_RESULTS = 1000;
// A named place near the road given with it ("Costa, Upper Street") ranks higher.
const NEAR_ROAD_KM = 0.6;

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
  private pois: { item: PointOfInterest; norms: string[]; address: string }[] = [];
  private poiTypes = new Set<string>();
  /** Places by the first two letters of each word in their names, so a search checks a few thousand, not all. */
  private poiByWordStart = new Map<string, number[]>();
  /** Outside-area name matches counted but not built during the current search. */
  private lastPoiOutsideRest = 0;

  constructor(roads: Road[], postcodes: PostcodePoint[], places: Place[] = []) {
    this.roads = roads.map((item) => ({ item, norm: normalise(item.name) }));
    this.postcodes = new Map(postcodes.map((p) => [p.postcode.replace(/\s/g, ""), p]));
    this.setPlaces(places);
  }

  /** Replace the estates and saved places (call after the officer adds one). */
  setPlaces(places: Place[]) {
    this.places = places.map((item) => ({ item, norm: normalise(item.name) }));
  }

  /**
   * Replace the named places (when a newer places file arrives). Works in
   * batches, yielding between them, so the screen stays responsive while
   * a couple of hundred thousand names are indexed.
   */
  async setPointsOfInterest(pois: PointOfInterest[], batch = 5000): Promise<void> {
    const indexed: typeof this.pois = [];
    const byWordStart = new Map<string, number[]>();
    for (let start = 0; start < pois.length; start += batch) {
      for (let i = start; i < Math.min(start + batch, pois.length); i++) {
        const item = pois[i]!;
        const norms = [item.name, ...item.otherNames].map(normalise);
        indexed.push({ item, norms, address: normalise(item.address) });
        const starts = new Set<string>();
        for (const n of norms) for (const w of n.split(" ")) if (w.length >= 2) starts.add(w.slice(0, 2));
        for (const st of starts) {
          const list = byWordStart.get(st);
          if (list) list.push(i);
          else byWordStart.set(st, [i]);
        }
      }
      if (start + batch < pois.length) await new Promise((r) => setTimeout(r, 0));
    }
    // Swap in all at once, so a search never sees half an index.
    this.pois = indexed;
    this.poiByWordStart = byWordStart;
    this.poiTypes = new Set(pois.map((p) => p.type));
  }

  /** Named places in the given boroughs and groups, for map markers. */
  pointsOfInterestIn(boroughs: ReadonlySet<Borough>, groups: ReadonlySet<PlaceGroup>): PointOfInterest[] {
    if (!boroughs.size || !groups.size) return [];
    return this.pois.filter((p) => boroughs.has(p.item.borough) && groups.has(p.item.group)).map((p) => p.item);
  }

  get pointOfInterestCount(): number {
    return this.pois.length;
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
    const types = typesForQuery(raw, this.poiTypes);
    const listed = this.listOfType(types, area);
    this.lastPoiOutsideRest = 0;
    const hits = [...this.collect(raw, area), ...listed.inArea];
    const limit = parseQuery(raw).outwardCode || types.length ? MAX_LIST_RESULTS : MAX_RESULTS;

    const seen = new Set<string>();
    const unique = hits
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .filter((h) => {
        const k = h.kind === "poi" ? h.key : `${h.label}|${h.borough}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

    const outside = unique.filter((h) => !area.has(h.borough));
    for (const h of listed.outsideSample) if (!seen.has(h.key)) outside.push(h);
    return {
      inArea: unique.filter((h) => area.has(h.borough)).slice(0, limit),
      outside,
      outsideCount: outside.length + listed.outsideRest + this.lastPoiOutsideRest,
    };
  }

  private collect(raw: string, area: ReadonlySet<Borough>): SearchResult[] {
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
    // Named places can be any part ("Costa, Upper Street"; "Smith House, Holloway Road").
    if (!q.number && !q.flat) hits.push(...this.matchPointsOfInterest(q.parts, area));

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

  private matchPointsOfInterest(parts: string[], area: ReadonlySet<Borough>): SearchResult[] {
    const norms = parts.map(normalise).filter((n) => n.length >= 2);
    // Score as plain numbers first; only the best become full results.
    const scored: { idx: number; score: number }[] = [];
    norms.forEach((norm, i) => {
      const others = norms.filter((_, j) => j !== i);
      // Points of roads named in the other parts, to rank places near them.
      const nearRoads = others.flatMap((o) => this.roads.filter((r) => matchScore(r.norm, o) >= 90).map((r) => r.item));
      for (const idx of this.poiByWordStart.get(norm.slice(0, 2)) ?? []) {
        const p = this.pois[idx]!;
        let score = 0;
        for (const n of p.norms) score = Math.max(score, matchScore(n, norm));
        if (!score) continue;
        if (others.some((o) => p.address.includes(o)) || nearRoads.some((r) => distanceKm(r, p.item) < NEAR_ROAD_KM)) {
          score += 8;
        }
        scored.push({ idx, score });
      }
    });
    scored.sort((a, b) => b.score - a.score);
    const out: SearchResult[] = [];
    let inArea = 0;
    let outside = 0;
    for (const { idx, score } of scored) {
      const p = this.pois[idx]!.item;
      const mine = area.has(p.borough);
      if (mine ? inArea++ < MAX_RESULTS * 2 : outside++ < MAX_RESULTS) out.push(this.poiResult(p, score));
    }
    this.lastPoiOutsideRest = Math.max(0, outside - MAX_RESULTS);
    return out;
  }

  /**
   * Every place of the given types in the area ("coffee shops" → all of them).
   * Outside the area only a sample is built; the rest are just counted.
   */
  private listOfType(
    types: string[],
    area: ReadonlySet<Borough>,
  ): { inArea: SearchResult[]; outsideSample: SearchResult[]; outsideRest: number } {
    const out = { inArea: [] as SearchResult[], outsideSample: [] as SearchResult[], outsideRest: 0 };
    if (!types.length) return out;
    const wanted = new Set(types);
    for (const { item } of this.pois) {
      if (!wanted.has(item.type)) continue;
      if (area.has(item.borough)) out.inArea.push(this.poiResult(item, 60));
      else if (out.outsideSample.length < MAX_RESULTS) out.outsideSample.push(this.poiResult(item, 60));
      else out.outsideRest++;
    }
    return out;
  }

  private poiResult(p: PointOfInterest, score: number): SearchResult {
    return {
      key: `poi:${p.name}|${p.type}|${p.lat}|${p.lng}`,
      label: p.name,
      detail: [p.type, p.borough, p.address].filter(Boolean).join(" · "),
      borough: p.borough,
      lat: p.lat,
      lng: p.lng,
      kind: "poi",
      precision: "place",
      score,
      placeType: p.type,
      placeGroup: p.group,
    };
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
