import * as Location from "expo-location";
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
  requestPermission: () => Promise<void>;
}

const LocationContext = createContext<LocationState | null>(null);

function toFix(loc: Location.LocationObject): Fix {
  const { latitude, longitude, accuracy, speed, heading } = loc.coords;
  // Platforms report "unknown" as -1 or null; normalise both to null so
  // screens can show "—" instead of a made-up number.
  return {
    lat: latitude,
    lng: longitude,
    accuracy: accuracy != null && accuracy >= 0 ? accuracy : null,
    speed: speed != null && speed >= 0 ? speed : null,
    course: heading != null && heading >= 0 ? heading : null,
    timestamp: loc.timestamp,
  };
}

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
  const [gpsFix, setFix] = useState<Fix | null>(null);
  const [demoFix, setDemoFix] = useState<Fix | null>(null);
  const subscription = useRef<Location.LocationSubscription | null>(null);

  const startWatching = useCallback(async () => {
    if (subscription.current) return;
    const last = await Location.getLastKnownPositionAsync();
    if (last) setFix((current) => current ?? toFix(last));
    subscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (loc) => setFix(toFix(loc)),
    );
  }, []);

  const stopWatching = useCallback(() => {
    subscription.current?.remove();
    subscription.current = null;
  }, []);

  const refresh = useCallback(
    async (ask: boolean) => {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain && ask) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!permission.granted) {
        stopWatching();
        setStatus(permission.canAskAgain ? "needs-permission" : "denied");
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        stopWatching();
        setStatus("services-off");
        return;
      }
      setStatus("granted");
      await startWatching();
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

  const requestPermission = useCallback(() => refresh(true), [refresh]);

  const value = useMemo(
    () =>
      simulated
        ? { status: "granted" as const, simulated, fix: demoFix, requestPermission }
        : { status, simulated, fix: gpsFix, requestPermission },
    [simulated, status, demoFix, gpsFix, requestPermission],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

// GPS course is noise when standing still or walking.
const MOVING_MS = 2;

/** The fix as a route origin, with its direction of travel when moving. */
export function routeOrigin(fix: Fix): { lat: number; lng: number; heading?: number } {
  const moving = fix.course != null && fix.speed != null && fix.speed >= MOVING_MS;
  return moving ? { lat: fix.lat, lng: fix.lng, heading: Math.round(fix.course!) % 360 } : { lat: fix.lat, lng: fix.lng };
}

export function useLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used inside LocationProvider");
  return ctx;
}
