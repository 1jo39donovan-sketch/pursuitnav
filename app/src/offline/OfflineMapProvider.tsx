// Downloads, keeps and deletes the map kept on the phone for when there's no
// signal (Session, "Map for offline use"), and gives the maps its styles once
// it's here. Wi-Fi only unless mobile data is allowed. A download carries on
// where it stopped: when the app comes back from the background, when signal
// returns, or the next time the app opens. Nothing about the officer is sent:
// the requests are for public map files, the same for everyone.
import { Directory, DownloadTask, File, Paths } from "expo-file-system";
import { addNetworkStateListener, getNetworkStateAsync, NetworkStateType } from "expo-network";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";

import { serverJson } from "../api/http";
import { API_URL, region } from "../config";
import { store } from "../storage/store";
import {
  isManifest,
  localStyle,
  safePath,
  stillToFetch,
  unsuitable,
  type OfflineManifest,
} from "./offlinePack";

export type OfflineMapState =
  /** Nothing on the phone. offer: what the server has, once asked. */
  | { status: "none"; offer: OfflineManifest | null; checking: boolean; error?: string }
  | { status: "downloading"; manifest: OfflineManifest; doneBytes: number }
  /** Stopped until Wi-Fi (or mobile data is allowed), or signal, is back. */
  | { status: "waiting"; manifest: OfflineManifest; doneBytes: number; reason: "wifi" | "no-signal" }
  | { status: "ready"; version: string; built: string; bytes: number };

export interface OfflineMapValue {
  /** False on the web: no offline map there. */
  supported: boolean;
  state: OfflineMapState;
  /** The map styles reading from the phone, once the map is here. */
  styles: { night: string; day: string } | null;
  allowMobile: boolean;
  setAllowMobile: (v: boolean) => void;
  /** Asks the server what's on offer (size, date), for showing before a download. */
  check: () => void;
  download: () => void;
  cancel: () => void;
  remove: () => void;
}

const Context = createContext<OfflineMapValue | null>(null);
const ROOT = () => new Directory(Paths.document, "offline-map");
const folder = (version: string) => new Directory(Paths.document, "offline-map", version);
// Files this big go through a task that can pause and resume part-way.
const RESUMABLE_BYTES = 2_000_000;

function sizeOnPhone(version: string, path: string): number | null {
  const f = new File(folder(version), path);
  return f.exists ? (f.size ?? null) : null;
}

async function readStyles(version: string, m: { styles: Record<string, string> }) {
  const dir = folder(version);
  const read = (p: string) => new File(dir, p).text();
  const [night, day] = await Promise.all([read(m.styles.night!), read(m.styles.day!)]);
  return { night: localStyle(night, dir.uri), day: localStyle(day, dir.uri) };
}

async function onWifi(): Promise<boolean | null> {
  const n = await getNetworkStateAsync().catch(() => null);
  if (!n || n.isConnected === false) return null;
  return n.type === NetworkStateType.WIFI || n.type === NetworkStateType.ETHERNET;
}

function readySaved(): Extract<OfflineMapState, { status: "ready" }> | null {
  const version = store.getSetting("offlineMapVersion");
  const built = store.getSetting("offlineMapBuilt");
  const bytes = Number(store.getSetting("offlineMapBytes") ?? 0);
  if (!version || !built || !folder(version).exists) return null;
  return { status: "ready", version, built, bytes };
}

export function OfflineMapProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OfflineMapState>(
    () => readySaved() ?? { status: "none", offer: null, checking: false },
  );
  const [loaded, setLoaded] = useState<{ version: string; styles: NonNullable<OfflineMapValue["styles"]> } | null>(
    null,
  );
  const [allowMobile, setAllowMobileState] = useState(() => store.getSetting("offlineMapMobile") === "1");
  const setAllowMobile = useCallback((v: boolean) => {
    store.setSetting("offlineMapMobile", v ? "1" : "");
    setAllowMobileState(v);
  }, []);
  const allowMobileRef = useRef(allowMobile);
  useEffect(() => {
    allowMobileRef.current = allowMobile;
  }, [allowMobile]);

  // The one download running, if any. stop() makes it give up at the next step.
  const run = useRef<{ stopped: boolean; task: DownloadTask | null } | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // The map that's here, read once for the map screens.
  const readyVersion = state.status === "ready" ? state.version : null;
  useEffect(() => {
    if (!readyVersion) return;
    let live = true;
    const styleFiles = { styles: { night: "styles/night.json", day: "styles/day.json" } };
    readStyles(readyVersion, styleFiles)
      .then((styles) => live && setLoaded({ version: readyVersion, styles }))
      // Unreadable: the maps stay online, as before the download.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [readyVersion]);
  const styles = loaded && loaded.version === readyVersion ? loaded.styles : null;

  const fetchManifest = useCallback(async (): Promise<OfflineManifest> => {
    if (!API_URL) throw new Error("The offline map comes from the BlueRoute server, which isn't set up in this build.");
    const res = await serverJson(`${API_URL}/v1/offline-map`);
    if (res.status === 503) throw new Error("The server hasn't built an offline map yet.");
    if (!res.ok || !isManifest(res.body)) throw new Error(`Couldn't get the offline map (${res.status}).`);
    const why = unsuitable(res.body, region);
    if (why) throw new Error(why);
    return res.body;
  }, []);

  const check = useCallback(() => {
    if (stateRef.current.status !== "none") return;
    setState({ status: "none", offer: null, checking: true });
    fetchManifest().then(
      (offer) => setState((s) => (s.status === "none" ? { status: "none", offer, checking: false } : s)),
      (err: unknown) =>
        setState((s) =>
          s.status === "none"
            ? { status: "none", offer: null, checking: false, error: err instanceof Error ? err.message : String(err) }
            : s,
        ),
    );
  }, [fetchManifest]);

  // Fetches whatever isn't on the phone yet, then puts the map live.
  const go = useCallback(async (m: OfflineManifest) => {
    if (run.current) return;
    const me = { stopped: false, task: null as DownloadTask | null };
    run.current = me;
    const dir = folder(m.version);
    try {
      dir.create({ intermediates: true, idempotent: true });
      store.setSetting("offlineMapPending", JSON.stringify(m));
      const left = stillToFetch(m, (p) => sizeOnPhone(m.version, p));
      let done = m.bytes - left.bytes;
      setState({ status: "downloading", manifest: m, doneBytes: done });
      for (const f of left.files) {
        if (me.stopped) return;
        if (!safePath(f.path)) throw new Error("The offline map has a file it shouldn't.");
        const wifi = await onWifi();
        if (wifi === null) {
          setState({ status: "waiting", manifest: m, doneBytes: done, reason: "no-signal" });
          return;
        }
        if (!wifi && !allowMobileRef.current) {
          setState({ status: "waiting", manifest: m, doneBytes: done, reason: "wifi" });
          return;
        }
        const target = new File(dir, f.path);
        target.parentDirectory.create({ intermediates: true, idempotent: true });
        const url = `${API_URL}${m.base}${f.path}`;
        if (f.bytes >= RESUMABLE_BYTES) {
          const saved = store.getSetting("offlineMapResume");
          const onProgress = ({ bytesWritten }: { bytesWritten: number }) =>
            !me.stopped && setState({ status: "downloading", manifest: m, doneBytes: done + bytesWritten });
          let task: DownloadTask;
          const resumable = saved ? (JSON.parse(saved) as { url: string }) : null;
          if (resumable?.url === url) {
            task = DownloadTask.fromSavable(JSON.parse(saved!), { onProgress });
          } else {
            if (target.exists) target.delete();
            task = File.createDownloadTask(url, target, { onProgress });
          }
          me.task = task;
          const file = resumable?.url === url ? await task.resumeAsync() : await task.downloadAsync();
          me.task = null;
          // Paused (to the background): carried on when the app is back.
          if (!file) return;
          store.setSetting("offlineMapResume", "");
        } else {
          await File.downloadFileAsync(url, target, { idempotent: true });
        }
        if (sizeOnPhone(m.version, f.path) !== f.bytes) {
          throw new Error("A file of the offline map came down damaged. Download again.");
        }
        done += f.bytes;
        setState({ status: "downloading", manifest: m, doneBytes: done });
      }
      // All here: this is the map now; older ones go.
      store.setSetting("offlineMapVersion", m.version);
      store.setSetting("offlineMapBuilt", m.built);
      store.setSetting("offlineMapBytes", String(m.bytes));
      store.setSetting("offlineMapPending", "");
      for (const old of ROOT().list()) if (old instanceof Directory && old.name !== m.version) old.delete();
      setState({ status: "ready", version: m.version, built: m.built, bytes: m.bytes });
    } catch (err) {
      if (me.stopped) return;
      store.setSetting("offlineMapResume", "");
      // Signal gone part-way: carried on when it's back (this file from the start).
      const wifi = await onWifi();
      if (wifi === null) {
        setState({ status: "waiting", manifest: m, doneBytes: m.bytes - stillToFetch(m, (p) => sizeOnPhone(m.version, p)).bytes, reason: "no-signal" });
      } else {
        store.setSetting("offlineMapPending", "");
        const prior = readySaved();
        setState(prior ?? { status: "none", offer: null, checking: false, error: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      if (run.current === me) run.current = null;
    }
  }, []);

  const download = useCallback(() => {
    const s = stateRef.current;
    if (s.status === "downloading") return;
    const start = (m: OfflineManifest) => void go(m);
    if (s.status === "waiting") return start(s.manifest);
    if (s.status === "none" && s.offer) return start(s.offer);
    // An update, or nothing asked yet: get the newest manifest first.
    const have = s.status === "ready" ? s.version : null;
    fetchManifest().then(
      (m) => (m.version === have ? undefined : start(m)),
      (err: unknown) =>
        setState((cur) =>
          cur.status === "ready"
            ? cur
            : { status: "none", offer: null, checking: false, error: err instanceof Error ? err.message : String(err) },
        ),
    );
  }, [fetchManifest, go]);

  const stopRun = useCallback(() => {
    const r = run.current;
    if (!r) return;
    r.stopped = true;
    r.task?.cancel();
    run.current = null;
  }, []);

  const cancel = useCallback(() => {
    const s = stateRef.current;
    stopRun();
    store.setSetting("offlineMapPending", "");
    store.setSetting("offlineMapResume", "");
    if (s.status === "downloading" || s.status === "waiting") {
      const keep = readySaved();
      const dir = folder(s.manifest.version);
      if (s.manifest.version !== keep?.version && dir.exists) dir.delete();
      setState(keep ?? { status: "none", offer: s.manifest, checking: false });
    }
  }, [stopRun]);

  const remove = useCallback(() => {
    stopRun();
    for (const key of ["offlineMapVersion", "offlineMapBuilt", "offlineMapBytes", "offlineMapPending", "offlineMapResume"]) {
      store.setSetting(key, "");
    }
    const root = ROOT();
    if (root.exists) root.delete();
    setState({ status: "none", offer: null, checking: false });
  }, [stopRun]);

  // Carry on a download the app was closed during.
  useEffect(() => {
    const pending = store.getSetting("offlineMapPending");
    if (!pending) return;
    try {
      const m: unknown = JSON.parse(pending);
      if (!isManifest(m)) return;
      const t = setTimeout(() => void go(m), 0);
      return () => clearTimeout(t);
    } catch {
      store.setSetting("offlineMapPending", "");
    }
  }, [go]);

  // To the background: pause (keeping where it got to); back: carry on.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const r = run.current;
      const s = stateRef.current;
      if (next !== "active" && r?.task) {
        const task = r.task;
        task
          .pauseAsync()
          .then(() => store.setSetting("offlineMapResume", JSON.stringify(task.savable())))
          .catch(() => {});
      } else if (next === "active" && !run.current && (s.status === "downloading" || s.status === "waiting")) {
        void go(s.manifest);
      }
    });
    return () => sub.remove();
  }, [go]);

  // Signal or Wi-Fi back: carry on a download that was waiting for it.
  useEffect(() => {
    const sub = addNetworkStateListener((n) => {
      const s = stateRef.current;
      if (s.status !== "waiting" || n.isConnected === false) return;
      const wifi = n.type === NetworkStateType.WIFI || n.type === NetworkStateType.ETHERNET;
      if (s.reason === "no-signal" || wifi || allowMobileRef.current) void go(s.manifest);
    });
    return () => sub.remove();
  }, [go]);

  const value = useMemo<OfflineMapValue>(
    () => ({ supported: true, state, styles, allowMobile, setAllowMobile, check, download, cancel, remove }),
    [state, styles, allowMobile, setAllowMobile, check, download, cancel, remove],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOfflineMap(): OfflineMapValue {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useOfflineMap must be used inside OfflineMapProvider");
  return ctx;
}
