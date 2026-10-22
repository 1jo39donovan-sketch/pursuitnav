// Where GPS positions come from on the phone apps: expo-location. The web
// version (locationSource.web.ts) talks to the browser directly instead.
import * as Location from "expo-location";

import type { Fix, LocationStatus } from "./LocationProvider";

export function toFix(loc: Location.LocationObject): Fix {
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

/** Whether positions can be had, asking the user first if `ask` and it's allowed. */
export async function checkLocation(ask: boolean): Promise<LocationStatus> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted && permission.canAskAgain && ask) {
    permission = await Location.requestForegroundPermissionsAsync();
  }
  if (!permission.granted) return permission.canAskAgain ? "needs-permission" : "denied";
  if (!(await Location.hasServicesEnabledAsync())) return "services-off";
  return "granted";
}

/** Streams positions about once a second; returns a function that stops it. */
export async function watchLocation(onFix: (fix: Fix) => void, _onRefused: () => void): Promise<() => void> {
  const last = await Location.getLastKnownPositionAsync();
  if (last) onFix(toFix(last));
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
    (loc) => onFix(toFix(loc)),
  );
  return () => sub.remove();
}

/**
 * The phone's compass, for which way it's facing before the vehicle has
 * moved. True north when the phone can work it out, else magnetic (a few
 * degrees out in London). Returns a function that stops it.
 */
export async function watchCompass(onHeading: (degrees: number) => void): Promise<() => void> {
  try {
    const sub = await Location.watchHeadingAsync((h) => {
      const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      if (deg >= 0 && h.accuracy > 0) onHeading(deg);
    });
    return () => sub.remove();
  } catch {
    // No compass on this phone: the map shows a dot until the vehicle moves.
    return () => {};
  }
}
