// Whether this phone has agreed to the current terms, and a way to hear the
// moment it does: location is only asked for after that, so the permission
// question doesn't pop up over the terms on first launch (iOS check, 26 Nov).
import { store } from "../storage/store";

export const TERMS_VERSION = "16 November 2026";
const KEY = "termsAccepted";
const listeners = new Set<() => void>();

export function termsAccepted(): boolean {
  try {
    return store.getSetting(KEY) === TERMS_VERSION;
  } catch {
    return false;
  }
}

export function acceptTerms(): void {
  store.setSetting(KEY, TERMS_VERSION);
  listeners.forEach((l) => l());
}

/** Calls `listener` once the terms are agreed to; returns a function that stops listening. */
export function onTermsAccepted(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
