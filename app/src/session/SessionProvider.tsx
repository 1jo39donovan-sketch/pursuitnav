import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { BOROUGHS, type Borough } from "../search/boroughs";
import { clearQueue, uploadDue } from "../learning/queue";
import { MAP_LOOKS, type MapLook } from "../components/mapLooks";
import { store } from "../storage/store";
import { APPEARANCES, type Appearance } from "../theme";
import { isService, isVehicle, vehiclesFor, type ServiceType, type VehicleType } from "../vehicles";

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
  /** Police, ambulance, fire or other: null until chosen. */
  service: ServiceType | null;
  /** Choosing a service also picks a vehicle it uses and shows Pursuit only for police (both can be changed after). */
  setService: (s: ServiceType) => void;
  /** What's being driven; routes avoid limits it can't take. */
  vehicle: VehicleType;
  setVehicle: (v: VehicleType) => void;
  /** Night (dark) or day (light) map. */
  mapTheme: MapTheme;
  setMapTheme: (t: MapTheme) => void;
  /** Standard, high-contrast, plain or the OS road map. */
  mapLook: MapLook;
  setMapLook: (l: MapLook) => void;
  /** How the navigation and pursuit maps turn: north up, direction of travel up, or tilted 3D. */
  mapView: MapView;
  setMapView: (v: MapView) => void;
  /** Dark or light screens: following the phone, or chosen. */
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
  /** The screens are dark now. */
  dark: boolean;
  /** Larger text on Search, the route choice and navigation. */
  largeText: boolean;
  setLargeText: (on: boolean) => void;
  /** Spoken turn-by-turn directions. */
  voice: boolean;
  setVoice: (on: boolean) => void;
  /** Prefer main roads (room to overtake, bus lanes) or any roads (shorter, side streets). */
  roads: RoadChoice;
  setRoads: (r: RoadChoice) => void;
  /** Opt-in: time roads on drives to improve journey times (off unless turned on). */
  learning: boolean;
  setLearning: (on: boolean) => void;
  /** The Pursuit tab: on unless hidden (crews who never pursue, e.g. fire and ambulance). */
  showPursuit: boolean;
  setShowPursuit: (on: boolean) => void;
}

export type RoadChoice = "main" | "any";

export type MapTheme = "night" | "day";
export type MapView = "north" | "heading" | "3d";
export const MAP_VIEWS: MapView[] = ["3d", "heading", "north"];

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

  const [service, setServiceState] = useState<ServiceType | null>(() => {
    const saved = store.getSetting("service");
    return isService(saved) ? saved : null;
  });

  const [mapTheme, setMapTheme] = useSetting<MapTheme>("mapTheme", ["night", "day"], "day");
  const [mapLook, setMapLook] = useSetting<MapLook>("mapLook", MAP_LOOKS, "standard");
  const [mapView, setMapView] = useSetting<MapView>("mapView", MAP_VIEWS, "3d");
  // "voice" was first stored by the navigation screen as "1"/"0".
  const [voiceSetting, setVoiceSetting] = useSetting<"1" | "0">("voice", ["1", "0"], "1");
  const voice = voiceSetting === "1";
  const [roads, setRoads] = useSetting<RoadChoice>("roads", ["main", "any"], "main");
  const [appearance, setAppearance] = useSetting<Appearance>("appearance", APPEARANCES, "system");
  // app.json still says "dark" (changing it needs a new native build), so until then
  // the phone always reports dark here and "Match phone" means dark.
  const scheme = useColorScheme();
  const dark = appearance === "dark" || (appearance === "system" && scheme !== "light");
  const [largeSetting, setLargeSetting] = useSetting<"1" | "0">("largeText", ["1", "0"], "0");
  const largeText = largeSetting === "1";
  const setLargeText = useCallback((on: boolean) => setLargeSetting(on ? "1" : "0"), [setLargeSetting]);
  const setVoice = useCallback((on: boolean) => setVoiceSetting(on ? "1" : "0"), [setVoiceSetting]);
  const [learningSetting, setLearningSetting] = useSetting<"1" | "0">("learning", ["1", "0"], "0");
  const learning = learningSetting === "1";
  const [pursuitSetting, setPursuitSetting] = useSetting<"1" | "0">("showPursuit", ["1", "0"], "1");
  const showPursuit = pursuitSetting === "1";
  const setShowPursuit = useCallback((on: boolean) => setPursuitSetting(on ? "1" : "0"), [setPursuitSetting]);
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

  const setService = useCallback(
    (s: ServiceType) => {
      // The same service tapped again changes nothing (keeps the crew's own Pursuit choice).
      if (s === service) return;
      setServiceState(s);
      store.setSetting("service", s);
      const offered = vehiclesFor(s);
      if (!offered.includes(vehicle)) setVehicle(offered[0]!);
      setShowPursuit(s === "police");
    },
    [service, vehicle, setVehicle, setShowPursuit],
  );

  const value = useMemo(
    () => ({
      service,
      setService,
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
      mapLook,
      setMapLook,
      mapView,
      setMapView,
      voice,
      setVoice,
      appearance,
      setAppearance,
      dark,
      largeText,
      setLargeText,
      roads,
      setRoads,
      learning,
      setLearning,
      showPursuit,
      setShowPursuit,
    }),
    [
      service,
      setService,
      showPursuit,
      setShowPursuit,
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
      mapLook,
      setMapLook,
      mapView,
      setMapView,
      voice,
      setVoice,
      appearance,
      setAppearance,
      dark,
      largeText,
      setLargeText,
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
