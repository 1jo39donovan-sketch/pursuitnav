// The Underground, Overground, Elizabeth line, DLR and tram lines in their
// own colours, from the server's weekly build (extract_lines.py), kept on the
// phone so they draw with no signal. Without the file yet, the map draws the
// lines from its tiles, by kind of line.
import { useSyncExternalStore } from "react";

import { fetchNewer, loadCached } from "../search/dataFiles";
import { parseLines, type TransportLines } from "./transportLinesData";

export type { TransportLines };

// One copy for every map on screen, loaded once a launch.
let current: TransportLines | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(): Promise<void> {
  loading ??= (async () => {
    const use = (text: string | null) => {
      const parsed = text ? parseLines(text) : null;
      if (!parsed || parsed.geojson.features.length === 0) return;
      current = parsed;
      for (const l of listeners) l();
    };
    use(await loadCached("lines").catch(() => null));
    use(await fetchNewer("lines").catch(() => null));
  })();
  return loading;
}

function subscribe(changed: () => void): () => void {
  listeners.add(changed);
  void load();
  return () => listeners.delete(changed);
}
const snapshot = () => current;
const none = () => null;
const noSubscribe = () => () => {};

/** The coloured lines, or null until (or unless) the file is on the phone. */
export function useTransportLines(on: boolean): TransportLines | null {
  return useSyncExternalStore(on ? subscribe : noSubscribe, on ? snapshot : none, none);
}
