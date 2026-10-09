import type { Borough } from "../search/boroughs";

export interface SavedPlace {
  id: number;
  name: string;
  road: string;
  borough: Borough;
  lat: number;
  lng: number;
}

/** Everything the app keeps on the phone. Never synced anywhere. */
export interface Store {
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
  listPlaces(): SavedPlace[];
  addPlace(place: Omit<SavedPlace, "id">): SavedPlace;
  deletePlace(id: number): void;
}
