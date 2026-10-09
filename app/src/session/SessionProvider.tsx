import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { BOROUGHS, type Borough } from "../search/boroughs";
import { store } from "../storage/store";

interface Session {
  callsign: string;
  boroughs: Borough[];
  setCallsign: (callsign: string) => void;
  toggleBorough: (borough: Borough) => void;
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

  const setCallsign = useCallback((value: string) => {
    setCallsignState(value);
    store.setSetting("callsign", value);
  }, []);

  const toggleBorough = useCallback((borough: Borough) => {
    setBoroughs((current) => {
      const next = current.includes(borough) ? current.filter((b) => b !== borough) : [...current, borough];
      store.setSetting("boroughs", JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ callsign, boroughs, setCallsign, toggleBorough }),
    [callsign, boroughs, setCallsign, toggleBorough],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
