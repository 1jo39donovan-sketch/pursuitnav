// The app's one recorder, on the phone's own storage. Screens call it
// directly; the switch on Session turns it on (off by default).
import Constants from "expo-constants";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";

import { store } from "../storage/store";
import { Recorder } from "./recorder";

export const recorder = new Recorder(store);
recorder.setEnabled(store.getSetting("fieldTest") === "1");

export const APP_VERSION = Constants.expoConfig?.version ?? "unknown";
export const PLATFORM = Platform.OS;

export function setRecording(on: boolean): void {
  store.setSetting("fieldTest", on ? "1" : "");
  recorder.setEnabled(on);
}

/** Re-renders when recording is switched or a trip starts or ends. */
export function useRecorder(): { enabled: boolean; recording: boolean; full: boolean } {
  useSyncExternalStore(
    (fn) => recorder.subscribe(fn),
    () => recorder.version,
  );
  return { enabled: recorder.enabled, recording: !!recorder.current, full: recorder.full };
}

const FLUSH_EVERY_MS = 5000;

/** Writes what's been recorded every 5 s, and when the app goes to the background. */
export function useRecorderFlush(): void {
  useEffect(() => {
    const timer = setInterval(() => recorder.flush(), FLUSH_EVERY_MS);
    const sub = AppState.addEventListener("change", (s) => s !== "active" && recorder.flush());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
}
