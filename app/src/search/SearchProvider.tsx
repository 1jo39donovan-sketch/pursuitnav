import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import postcodesAsset from "../../assets/data/postcodes.dat";
import roadsAsset from "../../assets/data/roads.dat";
import { useSession } from "../session/SessionProvider";
import { store } from "../storage/store";
import type { SavedPlace } from "../storage/types";
import { parsePostcodes, parseRoads } from "./data";
import { SearchIndex, type Place, type SearchResults } from "./engine";
import { starterEstatePlaces } from "./estates";
import { loadText } from "./loadText";

type DataState = { status: "loading" } | { status: "ready"; index: SearchIndex } | { status: "error"; message: string };

interface SearchContextValue {
  data: DataState;
  search: (query: string) => SearchResults;
  savedPlaces: SavedPlace[];
  addPlace: (place: Omit<SavedPlace, "id">) => void;
  deletePlace: (id: number) => void;
}

const EMPTY: SearchResults = { inArea: [], outside: [] };
const SearchContext = createContext<SearchContextValue | null>(null);

const toPlace = (p: SavedPlace): Place => ({ ...p, kind: "saved" });

/**
 * Loads the bundled roads and postcodes once, in the background, and keeps
 * the officer's saved places in the search.
 */
export function SearchProvider({ children }: { children: ReactNode }) {
  const { boroughs } = useSession();
  const [data, setData] = useState<DataState>({ status: "loading" });
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>(() => store.listPlaces());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [roads, postcodes] = await Promise.all([
          loadText(roadsAsset),
          loadText(postcodesAsset),
        ]);
        if (cancelled) return;
        setData({ status: "ready", index: new SearchIndex(parseRoads(roads), parsePostcodes(postcodes)) });
      } catch (err) {
        if (!cancelled) setData({ status: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Estates and saved places are matched alongside roads.
  useEffect(() => {
    if (data.status === "ready") {
      data.index.setPlaces([...savedPlaces.map(toPlace), ...starterEstatePlaces(data.index)]);
    }
  }, [data, savedPlaces]);

  const area = useMemo(() => new Set(boroughs), [boroughs]);
  const search = useCallback(
    (query: string) => (data.status === "ready" ? data.index.search(query, area) : EMPTY),
    // savedPlaces: results change when a place is added, even though the index object doesn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, area, savedPlaces],
  );

  const addPlace = useCallback((place: Omit<SavedPlace, "id">) => {
    store.addPlace(place);
    setSavedPlaces(store.listPlaces());
  }, []);
  const deletePlace = useCallback((id: number) => {
    store.deletePlace(id);
    setSavedPlaces(store.listPlaces());
  }, []);

  const value = useMemo(
    () => ({ data, search, savedPlaces, addPlace, deletePlace }),
    [data, search, savedPlaces, addPlace, deletePlace],
  );
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used inside SearchProvider");
  return ctx;
}
