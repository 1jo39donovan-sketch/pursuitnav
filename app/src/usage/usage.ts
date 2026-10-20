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

/** Sends counted events, if there are any and nothing's already on its way. */
async function flush() {
  const report = pending(store);
  if (sending || !API_URL || !hasPending(report)) return;
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
    headers: () => ({ "x-install-id": installId(store, randomHex), "x-app-version": APP_VERSION }),
    onNoSignal: () => count(store, "timeout"),
    onAnswer: () => void flush(),
  });
}

/** A navigation or pursuit session started. */
export function recordEvent(event: Exclude<UsageEvent, "timeout">) {
  count(store, event);
  void flush();
}

export const currentInstallId = () => installId(store, randomHex);
export const newInstallId = () => resetInstallId(store, randomHex);
