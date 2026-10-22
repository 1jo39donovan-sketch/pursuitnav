import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import { DEMO_MODE } from "../config";
import { demoFixAt } from "../demo/demoDrive";
import { useSession } from "../session/SessionProvider";
import { facing as facingFrom, isMoving } from "./facing";
import { checkLocation, watchCompass, watchLocation } from "./locationSource";

export type LocationStatus =
  | "checking"
  | "granted"
  // Not granted yet, but the system will still show its prompt.
  | "needs-permission"
  // The officer said no; the system won't ask again, only Settings can fix it.
  | "denied"
  // Permission is fine but location services are switched off on the phone.
  | "services-off";

export interface Fix {
  lat: number;
  lng: number;
  /** Metres, or null if the phone didn't say. */
  accuracy: number | null;
  /** Metres per second from GPS, or null when unknown. Never negative. */
  speed: number | null;
  /** Degrees clockwise from true north (direction of travel), or null when unknown. */
  course: number | null;
  timestamp: number;
}

interface LocationState {
  status: LocationStatus;
  /** True when positions come from the demo drive, not the phone's GPS. */
  simulated: boolean;
  /** The most recent position, or null before the first fix. */
  fix: Fix | null;
  /**
   * Which way the vehicle is facing, degrees from true north: the direction
   * of travel, held when stopped, or the compass before it has moved. Null
   * when unknown. For the arrow on the maps (facing.ts).
   */
  facing: number | null;
  requestPermission: () => Promise<void>;
}

const LocationContext = createContext<LocationState | null>(null);

/**
 * One GPS subscription for the whole app. The map, routing and pursuit mode
 * all read the same position, so journey times are always from where the
 * phone actually is.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  // The demo drive replaces GPS: always in demo builds, and when switched on
  // in the app (for store reviewers, or trying it away from London).
  const { demoDrive } = useSession();
  const simulated = DEMO_MODE || demoDrive;
  const [status, setStatus] = useState<LocationStatus>("checking");
  const [gpsFix, setGpsFix] = useState<Fix | null>(null);
  // The last direction of travel, kept when the vehicle stops.
  const [lastCourse, setLastCourse] = useState<number | null>(null);
  const [compass, setCompass] = useState<number | null>(null);
  const setFix = useCallback((f: Fix) => {
    setGpsFix(f);
    if (isMoving(f)) setLastCourse(f.course);
  }, []);
  const [demoFix, setDemoFix] = useState<Fix | null>(null);
  const subscription = useRef<(() => void) | null>(null);

  const stopWatching = useCallback(() => {
    subscription.current?.();
    subscription.current = null;
  }, []);

  const startWatching = useCallback(async () => {
    if (subscription.current) return;
    subscription.current = await watchLocation(setFix, () => {
      stopWatching();
      setStatus("denied");
    });
  }, [stopWatching, setFix]);

  const refresh = useCallback(
    async (ask: boolean) => {
      const next = await checkLocation(ask);
      setStatus(next);
      if (next === "granted") await startWatching();
      else stopWatching();
    },
    [startWatching, stopWatching],
  );

  useEffect(() => {
    if (!simulated) return;
    const started = Date.now();
    const tick = () => setDemoFix(demoFixAt((Date.now() - started) / 1000));
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [simulated]);

  useEffect(() => {
    if (simulated) return;
    // refresh() only sets state after awaiting the permission check, so this
    // subscribes to an external system rather than updating state in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh(true).catch(() => setStatus("denied"));
    // Coming back from Settings is the usual way a denied permission gets
    // fixed, so check again whenever the app returns to the foreground.
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") refresh(false).catch(() => {});
    });
    return () => {
      appState.remove();
      stopWatching();
    };
  }, [simulated, refresh, stopWatching]);

  // The compass, only while there's permission and no direction of travel
  // yet to go on: it costs battery, and once moving GPS says which way.
  const needCompass = !simulated && status === "granted" && lastCourse === null;
  useEffect(() => {
    if (!needCompass) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    // Whole degrees are plenty, and save a redraw for every flicker.
    watchCompass((deg) => setCompass(Math.round(deg) % 360)).then((s) => {
      if (cancelled) s();
      else stop = s;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [needCompass]);

  const requestPermission = useCallback(() => refresh(true), [refresh]);

  const value = useMemo(
    () =>
      simulated
        ? { status: "granted" as const, simulated, fix: demoFix, facing: demoFix?.course ?? null, requestPermission }
        : { status, simulated, fix: gpsFix, facing: facingFrom(gpsFix, lastCourse, compass), requestPermission },
    [simulated, status, demoFix, gpsFix, lastCourse, compass, requestPermission],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/** The fix as a route origin, with its direction of travel when moving. */
export function routeOrigin(fix: Fix): { lat: number; lng: number; heading?: number } {
  return isMoving(fix) ? { lat: fix.lat, lng: fix.lng, heading: Math.round(fix.course!) % 360 } : { lat: fix.lat, lng: fix.lng };
}

export function useLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used inside LocationProvider");
  return ctx;
}
