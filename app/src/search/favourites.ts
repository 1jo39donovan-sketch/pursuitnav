// Places the crew star (a station, a custody suite, a hospital they go to
// often), kept on the phone and shown first in Search, one tap from a route.
import { store } from "../storage/store";

export interface Favourite {
  name: string;
  lat: number;
  lng: number;
  borough: string | null;
}

const KEY = "favourites";
const MAX = 20;
// About 10 m: the same place, starred from a search or from the map.
const SAME = 0.0001;

export const samePlace = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.abs(a.lat - b.lat) < SAME && Math.abs(a.lng - b.lng) < SAME;

export function parseFavourites(text: string | null): Favourite[] {
  try {
    const list: unknown = JSON.parse(text ?? "[]");
    return Array.isArray(list)
      ? list.filter(
          (f): f is Favourite =>
            !!f && typeof f.name === "string" && Number.isFinite(f.lat) && Number.isFinite(f.lng),
        )
      : [];
  } catch {
    return [];
  }
}

/** Starred: added at the top (at most 20 kept); starred again: removed. */
export function toggled(list: Favourite[], place: Favourite): Favourite[] {
  if (list.some((f) => samePlace(f, place))) return list.filter((f) => !samePlace(f, place));
  return [place, ...list].slice(0, MAX);
}

export const loadFavourites = () => parseFavourites(store.getSetting(KEY));
export const saveFavourites = (list: Favourite[]) => store.setSetting(KEY, JSON.stringify(list));
