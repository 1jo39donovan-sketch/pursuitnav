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
import { nearBoroughs } from "../area/area";
import { useSession } from "../session/SessionProvider";
import { store } from "../storage/store";
import type { SavedPlace } from "../storage/types";
import type { Borough } from "./boroughs";
import { fetchNewer, loadCached } from "./dataFiles";
import { parsePostcodes, parseRoads, parseServerRoads } from "./data";
import { SearchIndex, type AreaFilter, type Place, type SearchResults } from "./engine";
import { starterEstatePlaces } from "./estates";
import { loadText } from "./loadText";
import { parsePlacesFile } from "./places";
import { fetchNewerPlaces, loadCachedPlaces } from "./placesData";

type DataState = { status: "loading" } | { status: "ready"; index: SearchIndex } | { status: "error"; message: string };

/** Named places (shops, cafés, schools…) from the server's weekly file. */
export type PlacesInfo = { status: "none" } | { status: "ready"; count: number; builtOn: string };

interface SearchContextValue {
  data: DataState;
  places: PlacesInfo;
  search: (query: string) => SearchResults;
  /** The officer's boroughs, and anywhere just over their boundaries. */
  area: AreaFilter;
  savedPlaces: SavedPlace[];
  addPlace: (place: Omit<SavedPlace, "id">) => void;
  deletePlace: (id: number) => void;
}

/** How far over a boundary a road or place still counts as in the officer's area. */
const NEAR_AREA_M = 500;

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
  const [places, setPlaces] = useState<PlacesInfo>({ status: "none" });

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

  // Roads the bundled list misses (mews, estate roads), from the server's
  // weekly OpenStreetMap list: the copy kept on the phone, then any newer one.
  const [extraRoads, setExtraRoads] = useState(0);
  useEffect(() => {
    if (data.status !== "ready") return;
    let cancelled = false;
    const use = (text: string | null) => {
      if (!text || cancelled) return;
      try {
        const added = data.index.addRoads(parseServerRoads(text));
        if (added) setExtraRoads((n) => n + added);
      } catch {
        // A bad file is ignored; the bundled roads still work.
      }
    };
    (async () => {
      use(await loadCached("roads"));
      use(await fetchNewer("roads"));
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Named places: the copy kept on the phone first, then any newer one.
  useEffect(() => {
    if (data.status !== "ready") return;
    let cancelled = false;
    const use = async (text: string | null) => {
      if (!text || cancelled) return;
      try {
        const file = parsePlacesFile(text);
        await data.index.setPointsOfInterest(file.places);
        if (!cancelled) setPlaces({ status: "ready", count: file.places.length, builtOn: file.builtOn });
      } catch {
        // A bad file is ignored; search carries on with roads and addresses.
      }
    };
    (async () => {
      await use(await loadCachedPlaces());
      await use(await fetchNewerPlaces());
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Estates and saved places are matched alongside roads.
  useEffect(() => {
    if (data.status === "ready") {
      data.index.setPlaces([...savedPlaces.map(toPlace), ...starterEstatePlaces(data.index)]);
    }
  }, [data, savedPlaces]);

  // A road or place just over the line from a chosen borough counts too:
  // officers are often told the wrong borough for roads near a boundary.
  const area = useMemo(() => {
    const set = new Set(boroughs);
    return { has: (b: Borough) => set.has(b), near: nearBoroughs(set, NEAR_AREA_M) };
  }, [boroughs]);
  const search = useCallback(
    (query: string) => (data.status === "ready" ? data.index.search(query, area) : EMPTY),
    // savedPlaces, places, extraRoads: results change when they arrive, though the index object doesn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, area, savedPlaces, places, extraRoads],
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
    () => ({ data, places, search, area, savedPlaces, addPlace, deletePlace }),
    [data, places, search, area, savedPlaces, addPlace, deletePlace],
  );
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used inside SearchProvider");
  return ctx;
}
