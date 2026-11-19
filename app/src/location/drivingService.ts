// Android stops an app's GPS and voice soon after the screen locks or the
// operator switches app, unless it runs a foreground service: the "BlueRoute:
// directions on" notification. It runs only while navigating or in Pursuit,
// needs no "all the time" location permission, and ends with the app.
// iOS keeps going with the screen on (keep-awake); nothing to do there.
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { useEffect } from "react";
import { Platform } from "react-native";

import { colors } from "../theme";
import { drivingHolds } from "./drivingHold";
import type { Fix } from "./LocationProvider";
import { toFix } from "./locationSource";

const TASK = "blueroute-driving";
const listeners = new Set<(fix: Fix) => void>();

if (Platform.OS === "android") {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
    if (error || !data?.locations) return;
    for (const loc of data.locations) for (const fn of listeners) fn(toFix(loc));
  });
}

const holds = drivingHolds({
  async start() {
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 0,
      foregroundService: {
        notificationTitle: "BlueRoute: directions on",
        notificationBody: "Keeps directions and voice going with the screen off. Ends when you finish.",
        notificationColor: colors.amber,
        killServiceOnDestroy: true,
      },
    });
  },
  async stop() {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  },
});

/** Positions from the service, for when the app's own watch is held back in the background. */
export function onDrivingFix(fn: (fix: Fix) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Keeps GPS and voice going with the screen off while `on` (Android). */
export function useDrivingService(who: string, on: boolean) {
  useEffect(() => {
    if (Platform.OS !== "android" || !on) return;
    holds.hold(who);
    return () => {
      holds.release(who);
    };
  }, [who, on]);
}
