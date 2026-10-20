// Usage counting on the phone. What leaves it, with each request to the Blue
// Route server: a random install ID (made here on first launch; reset it on
// Session) and the app version. Plus, now and then, three numbers: how many
// navigation sessions and pursuit sessions were started, and how many
// requests got no answer in time. No positions, addresses, searches or
// callsigns: the README and the Session screen say exactly what's counted.
//
// Plain logic over a small settings store, so it can be tested off the phone.

export type UsageEvent = "navigation" | "pursuit" | "timeout";
export type Pending = Partial<Record<UsageEvent, number>>;

export interface SettingsStore {
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
}

const ID_KEY = "installId";
const PENDING_KEY = "usagePending";

/** The install ID, made on first use: 32 hex characters, from 16 random bytes. */
export function installId(store: SettingsStore, randomHex: () => string): string {
  const saved = store.getSetting(ID_KEY);
  if (saved && /^[0-9a-f]{32}$/.test(saved)) return saved;
  const id = randomHex();
  store.setSetting(ID_KEY, id);
  return id;
}

/** A new install ID: counted from now on as a different install. */
export function resetInstallId(store: SettingsStore, randomHex: () => string): string {
  const id = randomHex();
  store.setSetting(ID_KEY, id);
  return id;
}

export function pending(store: SettingsStore): Pending {
  try {
    const p = JSON.parse(store.getSetting(PENDING_KEY) ?? "{}") as Pending;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

/** Counts an event, kept until it can be sent (a session started with no signal still counts). */
export function count(store: SettingsStore, event: UsageEvent) {
  const p = pending(store);
  // Capped, so a long spell without signal can't build up an endless queue.
  p[event] = Math.min((p[event] ?? 0) + 1, 1000);
  store.setSetting(PENDING_KEY, JSON.stringify(p));
}

/** Takes off what was sent; anything counted meanwhile stays for next time. */
export function sent(store: SettingsStore, report: Pending) {
  const p = pending(store);
  for (const [event, n] of Object.entries(report) as [UsageEvent, number][]) {
    const left = (p[event] ?? 0) - n;
    if (left > 0) p[event] = left;
    else delete p[event];
  }
  store.setSetting(PENDING_KEY, JSON.stringify(p));
}

export const hasPending = (p: Pending) => Object.values(p).some((n) => (n ?? 0) > 0);
