// Places the crew star (a station, a custody suite, a hospital they go to
// often), kept on the phone and shown first in Search, one tap from a route.
import { useSyncExternalStore } from "react";

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

/** Renamed: the crew's own name for it ("Brixton nick"), never empty. */
export function renamed(list: Favourite[], index: number, name: string): Favourite[] {
  const clean = name.trim().slice(0, 60);
  return clean ? list.map((f, i) => (i === index ? { ...f, name: clean } : f)) : list;
}

/** Moved one place up (-1) or down (+1) the list. */
export function moved(list: Favourite[], index: number, by: -1 | 1): Favourite[] {
  const to = index + by;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

// One list for every screen (Search and Session), kept on the phone.
let current: Favourite[] | null = null;
const listeners = new Set<() => void>();
const snapshot = () => (current ??= loadFavourites());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Saves the list and shows it on every screen. */
export function setFavourites(list: Favourite[]) {
  current = list;
  saveFavourites(list);
  listeners.forEach((l) => l());
}

export function useFavourites(): Favourite[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
