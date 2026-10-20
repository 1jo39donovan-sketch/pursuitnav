import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { BOROUGHS, type Borough } from "../search/boroughs";
import { clearQueue, uploadDue } from "../learning/queue";
import { store } from "../storage/store";
import { isVehicle, type VehicleType } from "../vehicles";

interface Session {
  callsign: string;
  boroughs: Borough[];
  setCallsign: (callsign: string) => void;
  toggleBorough: (borough: Borough) => void;
  /** Replace the whole operating area (selecting or clearing a group at once). */
  setBoroughs: (boroughs: Borough[]) => void;
  /** Simulated drive in London instead of GPS (store reviewers, trying it out). */
  demoDrive: boolean;
  setDemoDrive: (on: boolean) => void;
  /** Offer blue-light routes beside standard ones (on unless switched off). */
  policeRoutes: boolean;
  setPoliceRoutes: (on: boolean) => void;
  /** What's being driven; routes avoid limits it can't take. */
  vehicle: VehicleType;
  setVehicle: (v: VehicleType) => void;
  /** Night (dark) or day (light) map. */
  mapTheme: MapTheme;
  setMapTheme: (t: MapTheme) => void;
  /** How the navigation and pursuit maps turn: north up, direction of travel up, or tilted 3D. */
  mapView: MapView;
  setMapView: (v: MapView) => void;
  /** Spoken turn-by-turn directions. */
  voice: boolean;
  setVoice: (on: boolean) => void;
  /** Prefer main roads (room to overtake, bus lanes) or any roads (shorter, side streets). */
  roads: RoadChoice;
  setRoads: (r: RoadChoice) => void;
  /** Opt-in: time roads on drives to improve journey times (off unless turned on). */
  learning: boolean;
  setLearning: (on: boolean) => void;
}

export type RoadChoice = "main" | "any";

export type MapTheme = "night" | "day";
export type MapView = "north" | "heading" | "3d";
export const MAP_VIEWS: MapView[] = ["heading", "3d", "north"];

/** A setting kept on the phone, read once at launch. */
function useSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const saved = store.getSetting(key);
    return (allowed as readonly string[]).includes(saved ?? "") ? (saved as T) : fallback;
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      store.setSetting(key, v);
    },
    [key],
  );
  return [value, set];
}

const SessionContext = createContext<Session | null>(null);

function loadBoroughs(): Borough[] {
  try {
    const saved = JSON.parse(store.getSetting("boroughs") ?? "[]") as string[];
    return saved.filter((b): b is Borough => (BOROUGHS as readonly string[]).includes(b));
  } catch {
    return [];
  }
}

/** Callsign and working boroughs, kept on the phone between launches. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [callsign, setCallsignState] = useState(() => store.getSetting("callsign") ?? "");
  const [boroughs, setBoroughs] = useState<Borough[]>(loadBoroughs);
  const [demoDrive, setDemoDriveState] = useState(() => store.getSetting("demoDrive") === "1");
  const setDemoDrive = useCallback((on: boolean) => {
    setDemoDriveState(on);
    store.setSetting("demoDrive", on ? "1" : "0");
  }, []);

  // On unless turned off: the operator chooses standard or blue light each time anyway.
  const [policeRoutes, setPoliceRoutesState] = useState(() => store.getSetting("policeRoutes") !== "0");
  const setPoliceRoutes = useCallback((on: boolean) => {
    setPoliceRoutesState(on);
    store.setSetting("policeRoutes", on ? "1" : "0");
  }, []);

  const [vehicle, setVehicleState] = useState<VehicleType>(() => {
    const saved = store.getSetting("vehicle");
    return isVehicle(saved) ? saved : "car";
  });
  const setVehicle = useCallback((v: VehicleType) => {
    setVehicleState(v);
    store.setSetting("vehicle", v);
  }, []);

  const [mapTheme, setMapTheme] = useSetting<MapTheme>("mapTheme", ["night", "day"], "night");
  const [mapView, setMapView] = useSetting<MapView>("mapView", MAP_VIEWS, "heading");
  // "voice" was first stored by the navigation screen as "1"/"0".
  const [voiceSetting, setVoiceSetting] = useSetting<"1" | "0">("voice", ["1", "0"], "1");
  const voice = voiceSetting === "1";
  const [roads, setRoads] = useSetting<RoadChoice>("roads", ["main", "any"], "main");
  const setVoice = useCallback((on: boolean) => setVoiceSetting(on ? "1" : "0"), [setVoiceSetting]);
  const [learningSetting, setLearningSetting] = useSetting<"1" | "0">("learning", ["1", "0"], "0");
  const learning = learningSetting === "1";
  // Sends road times that have waited long enough: at launch, then every half hour.
  useEffect(() => {
    if (!learning) return;
    void uploadDue();
    const t = setInterval(() => void uploadDue(), 30 * 60_000);
    return () => clearInterval(t);
  }, [learning]);
  const setLearning = useCallback(
    (on: boolean) => {
      setLearningSetting(on ? "1" : "0");
      // Turning it off also deletes anything not yet sent.
      if (!on) clearQueue();
    },
    [setLearningSetting],
  );

  const setCallsign = useCallback((value: string) => {
    setCallsignState(value);
    store.setSetting("callsign", value);
  }, []);

  const setBoroughList = useCallback((next: Borough[]) => {
    setBoroughs(next);
    store.setSetting("boroughs", JSON.stringify(next));
  }, []);

  const toggleBorough = useCallback((borough: Borough) => {
    setBoroughs((current) => {
      const next = current.includes(borough) ? current.filter((b) => b !== borough) : [...current, borough];
      store.setSetting("boroughs", JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      callsign,
      boroughs,
      setCallsign,
      toggleBorough,
      setBoroughs: setBoroughList,
      demoDrive,
      setDemoDrive,
      policeRoutes,
      setPoliceRoutes,
      vehicle,
      setVehicle,
      mapTheme,
      setMapTheme,
      mapView,
      setMapView,
      voice,
      setVoice,
      roads,
      setRoads,
      learning,
      setLearning,
    }),
    [
      learning,
      setLearning,
      callsign,
      boroughs,
      setCallsign,
      toggleBorough,
      setBoroughList,
      demoDrive,
      setDemoDrive,
      policeRoutes,
      setPoliceRoutes,
      vehicle,
      setVehicle,
      mapTheme,
      setMapTheme,
      mapView,
      setMapView,
      voice,
      setVoice,
      roads,
      setRoads,
    ],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
