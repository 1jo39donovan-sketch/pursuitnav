// The places file: see dataFiles.ts.
import { fetchNewer, loadCached } from "./dataFiles";

export const loadCachedPlaces = () => loadCached("places");
export const fetchNewerPlaces = (force = false) => fetchNewer("places", force);
