// Wires usage counting into the app (see events.ts for what's counted).
import { getRandomBytes } from "expo-crypto";
import Constants from "expo-constants";

import { serverJson, setClientHooks } from "../api/http";
import { API_URL } from "../config";
import { store } from "../storage/store";
import { count, hasPending, installId, pending, resetInstallId, sent, type UsageEvent } from "./events";

const randomHex = () => Array.from(getRandomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
const APP_VERSION = Constants.expoConfig?.version ?? "unknown";

let sending = false;

/** The crew can switch usage counting off (Session → Privacy and data): then no install ID goes anywhere. */
const OFF_KEY = "usageOff";
export const usageOn = () => store.getSetting(OFF_KEY) !== "1";
export function setUsageOn(on: boolean) {
  store.setSetting(OFF_KEY, on ? "0" : "1");
}

/** Sends counted events, if there are any and nothing's already on its way. */
async function flush() {
  const report = pending(store);
  if (sending || !API_URL || !usageOn() || !hasPending(report)) return;
  sending = true;
  try {
    const res = await serverJson(
      `${API_URL}/v1/usage`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: report }) },
      { uncounted: true },
    );
    if (res.ok) sent(store, report);
  } catch {
    // No signal: they're kept for next time.
  } finally {
    sending = false;
  }
}

/** Once, at start-up: every request carries the install ID and app version from now on. */
export function startUsage() {
  setClientHooks({
    // Switched off: only the app version, which every request needs to be answered right.
    headers: (): Record<string, string> =>
      usageOn() ? { "x-install-id": installId(store, randomHex), "x-app-version": APP_VERSION } : { "x-app-version": APP_VERSION },
    onTimeout: () => usageOn() && count(store, "timeout"),
    onAnswer: () => void flush(),
  });
}

/** A navigation or pursuit session started. */
export function recordEvent(event: Exclude<UsageEvent, "timeout">) {
  if (!usageOn()) return;
  count(store, event);
  void flush();
}

export const currentInstallId = () => installId(store, randomHex);
export const newInstallId = () => resetInstallId(store, randomHex);
